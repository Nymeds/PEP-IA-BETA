import OpenAI from 'openai'
import { createReadStream, existsSync } from 'fs'
import { ExtractedData, reinterpretFullTranscript } from './extraction.service'
import { diarizationSchema, jsonSchemaResponseFormat } from './openai-schemas'
import { recordAiUsage } from './ai-usage.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface DialogueTurn {
  speaker: 'Médico' | 'Paciente' | 'Indefinido'
  text: string
}

interface ReviewOptions {
  consultationId?: string
  audioPath?: string | null
}

const DIARIZATION_PROMPT = `Voce recebe uma transcricao corrida de consulta medica em portugues.

Separe em turnos de fala, identificando Medico, Paciente ou Indefinido.
Nao invente, nao resuma e nao altere o conteudo clinico.`

function normalizeSpeaker(value?: string): DialogueTurn['speaker'] {
  const lower = (value || '').toLowerCase()
  if (lower.includes('med') || lower.includes('doctor') || lower.includes('clinician')) return 'Médico'
  if (lower.includes('pac') || lower.includes('patient')) return 'Paciente'
  return 'Indefinido'
}

function normalizeTurns(input: unknown): DialogueTurn[] {
  const container = input as { turns?: unknown[]; segments?: unknown[]; utterances?: unknown[] }
  const rawTurns = container.turns || container.segments || container.utterances || []
  if (!Array.isArray(rawTurns)) return []

  return rawTurns
    .map((turn) => {
      const item = turn as { speaker?: string; text?: string; transcript?: string }
      return {
        speaker: normalizeSpeaker(item.speaker),
        text: (item.text || item.transcript || '').trim(),
      }
    })
    .filter((turn) => turn.text)
}

// Diarizacao semantica por LLM: separa a transcricao corrida em turnos Medico/Paciente.
export async function diarizeTranscript(
  transcript: string,
  options: ReviewOptions = {}
): Promise<DialogueTurn[]> {
  if (!transcript.trim()) return []

  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'
  const startedAt = Date.now()

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: DIARIZATION_PROMPT },
      { role: 'user', content: `Transcricao da consulta:\n\n${transcript}` },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: jsonSchemaResponseFormat(
      'consultation_diarization',
      diarizationSchema,
      'Turnos de fala de uma consulta medica'
    ),
  })

  await recordAiUsage(
    {
      consultationId: options.consultationId,
      service: 'diarization_text',
      model,
      reason: 'revisao_final_textual',
      startedAt,
    },
    response.usage
  )

  try {
    return normalizeTurns(JSON.parse(response.choices[0]?.message?.content || '{}'))
  } catch {
    return []
  }
}

async function diarizeAudioFile(audioPath: string): Promise<DialogueTurn[]> {
  if (!existsSync(audioPath)) return []

  const model = process.env.OPENAI_FINAL_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe-diarize'
  const response = await getOpenAI().audio.transcriptions.create({
    file: createReadStream(audioPath),
    model,
    language: 'pt',
    response_format: 'diarized_json',
    chunking_strategy: 'auto',
  } as any)

  if (typeof response === 'string') return []
  return normalizeTurns(response)
}

export interface FinalReview {
  turns: DialogueTurn[]
  structuredText: string
  extracted: ExtractedData
}

// Revisao final: prefere diarizacao nativa por audio e usa fallback textual.
export async function runFinalReview(
  transcript: string,
  options: ReviewOptions = {}
): Promise<FinalReview> {
  let turns: DialogueTurn[] = []

  if (options.audioPath) {
    try {
      turns = await diarizeAudioFile(options.audioPath)
    } catch (err) {
      console.warn('[review] Diarizacao por audio falhou; usando fallback textual:', err)
    }
  }

  if (!turns.length) {
    turns = await diarizeTranscript(transcript, options)
  }

  const structuredText = turns.length
    ? turns.map((t) => `${t.speaker}: ${t.text}`).join('\n')
    : transcript

  const extracted = await reinterpretFullTranscript(structuredText, {
    consultationId: options.consultationId,
    reason: 'revisao_final',
  })

  return { turns, structuredText, extracted }
}
