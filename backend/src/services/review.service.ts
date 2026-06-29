import OpenAI from 'openai'
import { ExtractedData, reinterpretFullTranscript } from './extraction.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface DialogueTurn {
  speaker: 'Médico' | 'Paciente' | 'Indefinido'
  text: string
}

const DIARIZATION_PROMPT = `Você recebe a transcrição corrida (sem identificação de quem fala) de uma consulta médica em português.

Sua tarefa: reorganizar o texto em TURNOS de fala, identificando QUEM disse cada trecho.

Como identificar:
- MÉDICO: faz perguntas, conduz a anamnese, orienta, explica, pede exames, descreve achados do exame físico, dá diagnóstico e conduta.
- PACIENTE: relata sintomas, queixas, responde às perguntas, descreve o que sente, conta sua história.
- Se for genuinamente impossível decidir, use "Indefinido".

Regras:
- NÃO invente, resuma ou altere o conteúdo. Apenas separe e rotule o que foi dito.
- Corrija apenas pontuação e quebras óbvias para deixar legível.
- Descarte ruído ou trechos sem sentido.

Retorne SOMENTE um objeto JSON válido no formato:
{ "turns": [ { "speaker": "Médico" | "Paciente" | "Indefinido", "text": "..." } ] }`

// Diarização semântica por LLM: separa a transcrição corrida em turnos Médico/Paciente.
export async function diarizeTranscript(transcript: string): Promise<DialogueTurn[]> {
  if (!transcript.trim()) return []

  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: DIARIZATION_PROMPT },
      { role: 'user', content: `Transcrição da consulta:\n\n${transcript}` },
    ],
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content || '{}'
  try {
    const parsed = JSON.parse(content) as { turns?: DialogueTurn[] }
    return Array.isArray(parsed.turns) ? parsed.turns : []
  } catch {
    return []
  }
}

export interface FinalReview {
  turns: DialogueTurn[]
  structuredText: string
  extracted: ExtractedData
}

// Revisão final: relê TODA a conversa, separa os falantes e faz a extração apurada
// usando o diálogo estruturado (saber quem falou melhora muito a precisão).
export async function runFinalReview(transcript: string): Promise<FinalReview> {
  const turns = await diarizeTranscript(transcript)

  const structuredText = turns.length
    ? turns.map((t) => `${t.speaker}: ${t.text}`).join('\n')
    : transcript

  // Extrai sobre o diálogo estruturado — a IA distingue queixa do paciente de fala do médico
  const extracted = await reinterpretFullTranscript(structuredText)

  return { turns, structuredText, extracted }
}
