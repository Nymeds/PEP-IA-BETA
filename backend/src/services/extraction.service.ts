import OpenAI from 'openai'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const SYSTEM_PROMPT = `Você é um assistente médico especializado em extrair informações clínicas de transcrições de consultas médicas em português.

Você recebe a transcrição COMPLETA de uma consulta médica até o momento atual. Releia TODA a transcrição e produza o estado CONSOLIDADO de todos os campos clínicos.

REGRAS IMPORTANTES:
- Distribua cada informação no campo correto, com base no que aquele campo representa clinicamente.
- Se o paciente mencionou algo relevante em QUALQUER ponto da conversa (mesmo no meio, fora de ordem), capture e coloque no campo certo. Ex: uma dor citada no fim deve ir para os sintomas/HDA.
- DESCARTE completamente qualquer texto que NÃO seja clínico: ruído, frases sem sentido, conversa fiada, saudações, propaganda, conteúdo de vídeo, ou qualquer coisa que claramente não faça parte da consulta.
- Se uma informação não for clínica ou não for interessante para o prontuário, simplesmente ignore.
- Retorne o estado COMPLETO e atualizado de todos os campos com informação (não incremental). Omita campos que não têm informação clara.
- Não invente nada. Só registre o que foi realmente dito.

Retorne SOMENTE um objeto JSON válido, sem texto adicional, sem markdown, apenas o JSON puro.

Campos disponíveis:
{
  "chiefComplaint": "queixa principal em poucas palavras",
  "hda": "história da doença atual - descrição cronológica dos sintomas",
  "symptomStart": "início dos sintomas (ex: há 4 dias, desde segunda-feira)",
  "symptomIntensity": "intensidade de 0 a 10 ou descrição",
  "symptoms": ["lista de sintomas mencionados"],
  "improvingFactors": "o que melhora os sintomas",
  "worseningFactors": "o que piora os sintomas",
  "previousDiseases": ["doenças prévias"],
  "surgeries": ["cirurgias anteriores"],
  "hospitalizations": ["internações anteriores"],
  "allergiesDetails": [{"substance": "substância", "reaction": "tipo de reação"}],
  "currentMedications": [{"name": "nome", "dose": "dose", "frequency": "frequência", "route": "via"}],
  "familyHistory": {"diabetes": false, "hypertension": false, "stroke": false, "cancer": false, "heartDisease": false},
  "smoking": "não fumante / fumante X cigarros/dia / ex-fumante",
  "alcohol": "não bebe / uso social / uso frequente",
  "physicalActivity": "descrição da atividade física",
  "sleep": "qualidade e quantidade do sono",
  "diet": "hábitos alimentares",
  "occupation": "profissão/ocupação",
  "vitalSigns": {"pa": "120/80mmHg", "fc": "70bpm", "fr": "16irpm", "temp": "36.5°C", "spo2": "99%", "glucose": ""},
  "weight": 70.0,
  "height": 170.0,
  "generalState": "bom / regular / ruim",
  "physicalExam": {
    "headNeck": "cabeça e pescoço",
    "cardioRespiratory": "cardiorrespiratório",
    "abdomen": "abdome",
    "neurological": "neurológico",
    "extremities": "extremidades"
  },
  "mainHypothesis": "hipótese diagnóstica principal",
  "differentials": ["diagnósticos diferenciais"],
  "cid": [{"code": "J06.9", "description": "Infecção aguda das vias aéreas superiores"}],
  "therapeuticPlan": "plano terapêutico e condutas",
  "orientations": "orientações dadas ao paciente",
  "referrals": "encaminhamentos",
  "systemsReview": {
    "general": ["Febre", "Calafrios", "Perda de peso", "Fadiga", "Astenia"],
    "respiratory": ["Tosse", "Dispneia", "Sibilos", "Hemoptise", "Dor torácica"],
    "cardiovascular": ["Palpitações", "Dor precordial", "Edema", "Síncope", "Ortopneia"],
    "gastrointestinal": ["Náusea", "Vômito", "Dor abdominal", "Diarreia", "Constipação", "Hematêmese"],
    "genitourinary": ["Disúria", "Polaciúria", "Hematúria", "Corrimento", "Disfunção erétil"],
    "neurological": ["Cefaleia", "Tontura", "Convulsões", "Parestesia", "Déficit motor"],
    "psychiatric": ["Ansiedade", "Depressão", "Insônia", "Alterações de humor", "Alucinações"],
    "musculoskeletal": ["Artralgia", "Mialgia", "Rigidez articular", "Limitação de movimento"],
    "dermatological": ["Rash cutâneo", "Prurido", "Icterícia", "Cianose"]
  },
  "currentSection": "anamnese | antecedentes | habitos | revisao_sistemas | exame_fisico | diagnostico | conduta"
}

REGRA ESPECIAL para "systemsReview": liste em cada sistema APENAS os sintomas que o paciente relatou estar PRESENTES, escolhendo EXATAMENTE entre os rótulos listados acima (mesma grafia e acentuação). Ex: se o paciente diz que tem febre e dor de cabeça, retorne {"general": ["Febre"], "neurological": ["Cefaleia"]}. Não inclua sistemas sem sintomas presentes. Mapeie sinônimos para o rótulo correto (ex: "dor de cabeça" → "Cefaleia", "enjoo" → "Náusea", "falta de ar" → "Dispneia").`

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

// Relê a transcrição COMPLETA e devolve o estado consolidado de todos os campos,
// descartando ruído e redistribuindo cada informação no campo correto.
export async function reinterpretFullTranscript(fullTranscript: string): Promise<ExtractedData> {
  if (!fullTranscript.trim()) return {}

  const model = process.env.OPENAI_EXTRACTION_MODEL || 'gpt-4o'

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcrição completa da consulta até agora:\n\n${fullTranscript}` },
    ],
    temperature: 0.1,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content || '{}'

  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as ExtractedData
  } catch {
    return {}
  }
}

// Mantido por compatibilidade — agora aponta para a re-interpretação consolidada.
export const extractClinicalData = reinterpretFullTranscript

// Converte o ExtractedData (arrays/objetos) para os campos do banco (strings JSON / escalares).
// Só inclui campos que vieram preenchidos, para nunca apagar dados já existentes.
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
