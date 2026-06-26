import OpenAI from 'openai'

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

const TOPICS_PROMPT = `Você recebe a transcrição de uma consulta médica em português.

Identifique os TÓPICOS discutidos (ex: Queixa principal, História da doença, Antecedentes, Medicações, Exame físico, Diagnóstico, Conduta, etc.).

Para cada tópico, traga um título curto, um resumo de 1 linha e os trechos LITERAIS da transcrição relacionados.

Retorne SOMENTE JSON válido:
{ "topics": [ { "title": "...", "summary": "...", "excerpts": ["trecho literal 1", "trecho literal 2"] } ] }`

export async function suggestTopics(transcript: string): Promise<ConversationTopic[]> {
  if (!transcript.trim()) return []
  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: TOPICS_PROMPT },
      { role: 'user', content: `Transcrição:\n\n${transcript}` },
    ],
    temperature: 0.2,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
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

const SUMMARY_PROMPT = `Você é um médico revisando o histórico completo de um paciente antes de um atendimento.

Com base nos atendimentos anteriores fornecidos (em ordem cronológica), produza um RESUMO CLÍNICO consolidado para dar contexto rápido ao médico.

Retorne SOMENTE JSON válido:
{
  "overview": "parágrafo resumindo a trajetória do paciente, queixas recorrentes e evolução",
  "activeProblems": ["problemas/diagnósticos ativos ou recorrentes"],
  "medications": ["medicações em uso relevantes ao longo do histórico"],
  "allergies": ["alergias conhecidas"],
  "recommendations": "pontos de atenção e o que o médico deveria revisar/perguntar neste atendimento"
}

Não invente dados. Se algo não constar, deixe a lista vazia ou indique a ausência.`

export async function summarizePatient(input: PatientSummaryInput): Promise<PatientSummary> {
  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const consultationsText = input.consultations
    .map((c, i) => {
      const parts = [
        `Atendimento ${i + 1} (${c.date}):`,
        c.chiefComplaint ? `  Queixa: ${c.chiefComplaint}` : '',
        c.mainHypothesis ? `  Hipótese: ${c.mainHypothesis}` : '',
        c.assessment ? `  Avaliação: ${c.assessment}` : '',
        c.plan ? `  Conduta: ${c.plan}` : '',
        c.currentMedications ? `  Medicações: ${c.currentMedications}` : '',
        c.allergiesDetails ? `  Alergias: ${c.allergiesDetails}` : '',
      ].filter(Boolean)
      return parts.join('\n')
    })
    .join('\n\n')

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: `Paciente: ${input.name}\n\nHistórico de atendimentos:\n\n${consultationsText}` },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
  })

  try {
    return JSON.parse(response.choices[0]?.message?.content || '{}') as PatientSummary
  } catch {
    return { overview: 'Não foi possível gerar o resumo.', activeProblems: [], medications: [], allergies: [], recommendations: '' }
  }
}
