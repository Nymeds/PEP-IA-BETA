import OpenAI from 'openai'
import { z } from 'zod'
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

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface DialogueTurn {
  speaker: 'Medico' | 'Paciente' | 'Indefinido'
  text: string
}

const diarizationZodSchema = z.object({
  turns: z.array(z.object({ speaker: z.enum(['Medico', 'Paciente', 'Indefinido']), text: z.string() })),
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
          speaker: { type: 'string', enum: ['Medico', 'Paciente', 'Indefinido'] },
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
- Use Indefinido apenas quando nao houver sinal suficiente.
- Descarte ruido evidente e texto sem valor clinico.
`

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
  templateId: ClinicalTemplateId
  clinicalState: Record<string, unknown>
}): Promise<FinalReview> {
  const turns = await diarizeTranscript(input.transcript)
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
