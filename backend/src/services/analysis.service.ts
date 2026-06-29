import OpenAI from 'openai'
import { jsonSchemaResponseFormat, patientSummarySchema, topicsSchema } from './openai-schemas'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface ConversationTopic {
  title: string
  summary: string
  excerpts: string[]
}

const TOPICS_PROMPT = `Voce recebe a transcricao de uma consulta medica em portugues.

Identifique topicos clinicos discutidos, com titulo curto, resumo de uma linha e trechos literais relacionados.
Nao invente trechos.`

export async function suggestTopics(transcript: string): Promise<ConversationTopic[]> {
  if (!transcript.trim()) return []
  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: TOPICS_PROMPT },
      { role: 'user', content: `Transcricao:\n\n${transcript}` },
    ],
    temperature: 0.2,
    max_tokens: 2200,
    response_format: jsonSchemaResponseFormat(
      'conversation_topics',
      topicsSchema,
      'Topicos clinicos discutidos na consulta'
    ),
  })

  try {
    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}') as {
      topics?: ConversationTopic[]
    }
    return Array.isArray(parsed.topics) ? parsed.topics : []
  } catch {
    return []
  }
}

export interface PatientSummaryInput {
  name: string
  consultations: Array<{
    date: string
    chiefComplaint?: string | null
    mainHypothesis?: string | null
    assessment?: string | null
    plan?: string | null
    currentMedications?: string | null
    allergiesDetails?: string | null
  }>
}

export interface PatientSummary {
  overview: string
  activeProblems: string[]
  medications: string[]
  allergies: string[]
  recommendations: string
}

const SUMMARY_PROMPT = `Voce e um medico revisando o historico completo de um paciente antes de um atendimento.

Produza resumo clinico consolidado, sem inventar dados.
Se uma informacao nao constar, deixe a lista vazia ou indique ausencia.`

export async function summarizePatient(input: PatientSummaryInput): Promise<PatientSummary> {
  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const consultationsText = input.consultations
    .map((c, i) => {
      const parts = [
        `Atendimento ${i + 1} (${c.date}):`,
        c.chiefComplaint ? `  Queixa: ${c.chiefComplaint}` : '',
        c.mainHypothesis ? `  Hipotese: ${c.mainHypothesis}` : '',
        c.assessment ? `  Avaliacao: ${c.assessment}` : '',
        c.plan ? `  Conduta: ${c.plan}` : '',
        c.currentMedications ? `  Medicacoes: ${c.currentMedications}` : '',
        c.allergiesDetails ? `  Alergias: ${c.allergiesDetails}` : '',
      ].filter(Boolean)
      return parts.join('\n')
    })
    .join('\n\n')

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: `Paciente: ${input.name}\n\nHistorico de atendimentos:\n\n${consultationsText}` },
    ],
    temperature: 0.2,
    max_tokens: 1600,
    response_format: jsonSchemaResponseFormat(
      'patient_summary',
      patientSummarySchema,
      'Resumo clinico consolidado do paciente'
    ),
  })

  try {
    return JSON.parse(response.choices[0]?.message?.content || '{}') as PatientSummary
  } catch {
    return {
      overview: 'Nao foi possivel gerar o resumo.',
      activeProblems: [],
      medications: [],
      allergies: [],
      recommendations: '',
    }
  }
}
