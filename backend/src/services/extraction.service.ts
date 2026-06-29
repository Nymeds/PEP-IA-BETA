import OpenAI from 'openai'
import {
  clinicalExtractionSchema,
  jsonSchemaResponseFormat,
  removeNullishAndEmpty,
} from './openai-schemas'
import { recordAiUsage } from './ai-usage.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const SYSTEM_PROMPT = `Voce e um assistente medico especializado em extrair dados clinicos de consultas em portugues do Brasil.

Regras:
- Use apenas informacoes realmente ditas.
- Nao invente dados, diagnosticos, doses ou condutas.
- Ignore ruido, saudacoes e conversa nao clinica.
- Distribua cada dado no campo clinico correto.
- Para revisao de sistemas, liste apenas sintomas presentes.
- Quando nao houver evidencia clara para um campo, preencha null no schema.`

export interface ExtractedData {
  chiefComplaint?: string
  hda?: string
  symptomStart?: string
  symptomIntensity?: string
  symptoms?: string[]
  improvingFactors?: string
  worseningFactors?: string
  previousDiseases?: string[]
  surgeries?: string[]
  hospitalizations?: string[]
  allergiesDetails?: Array<{ substance: string; reaction: string }>
  currentMedications?: Array<{ name: string; dose: string; frequency: string; route: string }>
  familyHistory?: {
    diabetes?: boolean
    hypertension?: boolean
    stroke?: boolean
    cancer?: boolean
    heartDisease?: boolean
  }
  smoking?: string
  alcohol?: string
  physicalActivity?: string
  sleep?: string
  diet?: string
  occupation?: string
  vitalSigns?: {
    pa?: string
    fc?: string
    fr?: string
    temp?: string
    spo2?: string
    glucose?: string
  }
  weight?: number
  height?: number
  generalState?: string
  physicalExam?: {
    headNeck?: string
    cardioRespiratory?: string
    abdomen?: string
    neurological?: string
    extremities?: string
  }
  mainHypothesis?: string
  differentials?: string[]
  cid?: Array<{ code: string; description: string }>
  therapeuticPlan?: string
  orientations?: string
  referrals?: string
  systemsReview?: Record<string, string[]>
  currentSection?: string
}

export interface ExtractionCallOptions {
  consultationId?: string
  reason?: string
  segmentCount?: number
  model?: string
}

function parseExtracted(content: string): ExtractedData {
  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return removeNullishAndEmpty(JSON.parse(cleaned)) as ExtractedData
  } catch {
    return {}
  }
}

// Rele a transcricao completa e devolve o estado consolidado dos campos clinicos.
export async function reinterpretFullTranscript(
  fullTranscript: string,
  options: ExtractionCallOptions = {}
): Promise<ExtractedData> {
  if (!fullTranscript.trim()) return {}

  const model = options.model || process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'
  const startedAt = Date.now()

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcricao completa da consulta ate agora:\n\n${fullTranscript}` },
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: jsonSchemaResponseFormat(
      'clinical_extraction',
      clinicalExtractionSchema,
      'Dados clinicos consolidados extraidos da consulta'
    ),
  })

  await recordAiUsage(
    {
      consultationId: options.consultationId,
      service: 'clinical_extraction_full',
      model,
      reason: options.reason || 'reinterpretacao_completa',
      segmentCount: options.segmentCount,
      startedAt,
    },
    response.usage
  )

  return parseExtracted(response.choices[0]?.message?.content || '{}')
}

// Mantido por compatibilidade.
export const extractClinicalData = reinterpretFullTranscript

// Converte o ExtractedData para os campos do banco. So inclui campos preenchidos.
export function serializeExtractedToDb(e: ExtractedData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const str = (k: string, v?: string) => {
    if (v && v.trim()) out[k] = v
  }
  const json = (k: string, v?: unknown[] | Record<string, unknown>) => {
    if (v && (Array.isArray(v) ? v.length : Object.keys(v).length)) out[k] = JSON.stringify(v)
  }

  str('chiefComplaint', e.chiefComplaint)
  str('hda', e.hda)
  str('symptomStart', e.symptomStart)
  str('symptomIntensity', e.symptomIntensity)
  json('symptoms', e.symptoms)
  str('improvingFactors', e.improvingFactors)
  str('worseningFactors', e.worseningFactors)
  json('previousDiseases', e.previousDiseases)
  json('surgeries', e.surgeries)
  json('hospitalizations', e.hospitalizations)
  json('allergiesDetails', e.allergiesDetails)
  json('currentMedications', e.currentMedications)
  json('familyHistory', e.familyHistory as Record<string, unknown> | undefined)
  str('smoking', e.smoking)
  str('alcohol', e.alcohol)
  str('physicalActivity', e.physicalActivity)
  str('sleep', e.sleep)
  str('diet', e.diet)
  str('occupation', e.occupation)
  json('vitalSigns', e.vitalSigns as Record<string, unknown> | undefined)
  if (typeof e.weight === 'number') out.weight = e.weight
  if (typeof e.height === 'number') out.height = e.height
  str('generalState', e.generalState)
  json('physicalExam', e.physicalExam as Record<string, unknown> | undefined)
  str('mainHypothesis', e.mainHypothesis)
  json('differentials', e.differentials)
  json('cid', e.cid)
  str('therapeuticPlan', e.therapeuticPlan)
  str('orientations', e.orientations)
  str('referrals', e.referrals)
  json('systemsReview', e.systemsReview as Record<string, unknown> | undefined)

  return out
}
