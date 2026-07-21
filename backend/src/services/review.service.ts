import OpenAI, { toFile } from 'openai'
import { z } from 'zod'
import { existsSync } from 'fs'
import { basename } from 'path'
import {
  ClinicalSuggestion,
  ClinicalTemplateId,
  DeltaExtractionResult,
  ExtractedData,
  FieldProvenance,
  SoapNote,
  SpecialtyDataItem,
  extractClinicalDelta,
} from './extraction.service'
import { readFullAudio } from './speech.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface DialogueTurn {
  speaker: 'Medico' | 'Paciente' | 'Terceiro' | 'Indefinido'
  text: string
  start?: number
  end?: number
  diarizationLabel?: string
}

const diarizationZodSchema = z.object({
  turns: z.array(z.object({ speaker: z.enum(['Medico', 'Paciente', 'Terceiro', 'Indefinido']), text: z.string() })),
})

const DIARIZATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          speaker: { type: 'string', enum: ['Medico', 'Paciente', 'Terceiro', 'Indefinido'] },
          text: { type: 'string' },
        },
        required: ['speaker', 'text'],
      },
    },
  },
  required: ['turns'],
} as const

const DIARIZATION_PROMPT = `Voce recebe a transcricao corrida de uma consulta medica em portugues do Brasil.

Separe o texto em turnos de fala sem resumir, inventar ou alterar fatos clinicos.
- Medico: conduz anamnese, descreve exame, explica, orienta, solicita exames ou define conduta.
- Paciente: relata sintomas, historia, duvidas e responde ao profissional.
- Terceiro: acompanhante, responsavel, familiar, interprete ou outra pessoa presente.
- Use Indefinido apenas quando nao houver sinal suficiente.
- Nao apague falas. Preserve o texto para que relevancia e autorizacao sejam revisadas pelo profissional.
`

interface DiarizedAudioSegment {
  speaker?: string
  text?: string
  start?: number
  end?: number
}

/**
 * Diarizacao acustica da gravacao. Os rotulos retornados (A, B, C...) identificam
 * apenas vozes desta consulta e nunca sao usados como biometria persistente.
 */
export async function diarizeAudio(audioPath: string): Promise<DialogueTurn[]> {
  if (!audioPath || !existsSync(audioPath)) return []

  const model = process.env.OPENAI_DIARIZATION_MODEL || 'gpt-4o-transcribe-diarize'
  const audio = await readFullAudio(audioPath)
  const filename = basename(audioPath).replace(/\.enc$/, '')
  const response = await getOpenAI().audio.transcriptions.create({
    file: await toFile(audio, filename),
    model,
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
  } as never) as unknown as { segments?: DiarizedAudioSegment[] }

  return (response.segments || []).flatMap((segment) => {
    const text = segment.text?.trim()
    if (!text) return []
    return [{
      speaker: 'Indefinido' as const,
      text,
      start: typeof segment.start === 'number' ? segment.start : undefined,
      end: typeof segment.end === 'number' ? segment.end : undefined,
      diarizationLabel: segment.speaker?.trim() || undefined,
    }]
  })
}

export async function diarizeTranscript(transcript: string): Promise<DialogueTurn[]> {
  if (!transcript.trim()) return []

  const model = process.env.OPENAI_FINAL_REVIEW_MODEL || process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'
  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: DIARIZATION_PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'clinical_diarization', strict: true, schema: DIARIZATION_SCHEMA },
    },
  })

  const content = response.choices[0]?.message?.content || '{}'
  let rawOutput: unknown
  try {
    rawOutput = JSON.parse(content)
  } catch {
    throw new Error('A diarizacao retornou uma resposta invalida')
  }
  const parsed = diarizationZodSchema.safeParse(rawOutput)
  if (!parsed.success) throw new Error('A diarizacao retornou um formato invalido')

  return parsed.data.turns.filter((turn) => turn.text.trim())
}

export interface FinalReview {
  turns: DialogueTurn[]
  structuredText: string
  extracted: ExtractedData
  fieldMeta: Record<string, FieldProvenance>
  suggestions: ClinicalSuggestion[]
  specialtyData: SpecialtyDataItem[]
  soap: SoapNote
  usage: DeltaExtractionResult['usage']
}

// A revisao final combina a evidencia diarizada, a extracao e o SOAP em uma unica chamada clinica.
export async function runFinalReview(input: {
  transcript: string
  audioPath?: string | null
  templateId: ClinicalTemplateId
  clinicalState: Record<string, unknown>
}): Promise<FinalReview> {
  let turns: DialogueTurn[] = []
  if (input.audioPath) {
    try {
      turns = await diarizeAudio(input.audioPath)
    } catch (error) {
      console.error('[diarizacao] Falha na passagem de audio; usando transcricao:', error)
    }
  }
  if (!turns.length) turns = await diarizeTranscript(input.transcript)
  const structuredText = turns.length
    ? turns.map((turn) => `${turn.speaker}: ${turn.text}`).join('\n')
    : input.transcript

  const output = await extractClinicalDelta({
    templateId: input.templateId,
    clinicalState: input.clinicalState,
    segments: [{ id: 'final-review', sequence: 1, text: structuredText }],
    finalReview: true,
    model: process.env.OPENAI_FINAL_REVIEW_MODEL || process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o',
  })

  return {
    turns,
    structuredText,
    extracted: output.extracted,
    fieldMeta: output.fieldMeta,
    suggestions: output.suggestions,
    specialtyData: output.specialtyData,
    soap: output.soap || {
      subjective: 'Dados insuficientes para gerar o Subjetivo automaticamente.',
      objective: 'Dados insuficientes para gerar o Objetivo automaticamente.',
      assessment: 'Avaliar clinicamente antes de concluir.',
      plan: 'Revisar e definir a conduta manualmente.',
    },
    usage: output.usage,
  }
}
