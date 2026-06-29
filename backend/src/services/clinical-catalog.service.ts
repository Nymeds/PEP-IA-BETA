import type { ExtractedData as LegacyExtractedData } from './extraction.service'

type RosSystemKey =
  | 'general'
  | 'head_neck'
  | 'respiratory'
  | 'cardiovascular'
  | 'gastrointestinal'
  | 'genitourinary'
  | 'neurological'
  | 'psychiatric'
  | 'musculoskeletal'
  | 'dermatological'
  | 'endocrine'

interface SymptomTag {
  id: string
  label: string
  system: RosSystemKey
  source: 'catalog' | 'custom'
  evidence?: string | null
}

interface PhysicalActivityData {
  status?: string | null
  modalities?: string[]
  frequencyPerWeek?: number | null
  durationMinutes?: number | null
  intensity?: string | null
  sedentaryTime?: string | null
  limitations?: string | null
  notes?: string | null
}

interface NormalizedExtractedData {
  chiefComplaint?: string
  hda?: string
  symptomStart?: string
  symptomIntensity?: string
  symptoms?: SymptomTag[]
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
  physicalActivity?: PhysicalActivityData
  sleep?: string
  diet?: string
  drugs?: string
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
  confirmedDiagnosis?: string
  cid?: Array<{ code: string; description: string }>
  therapeuticPlan?: string
  orientations?: string
  referrals?: string
  followUpDate?: string
  systemsReview?: Partial<Record<RosSystemKey, SymptomTag[]>>
  currentSection?: string
}

const SYSTEMS: Array<{ key: RosSystemKey; label: string; description: string }> = [
  { key: 'general', label: 'Geral', description: 'Sintomas constitucionais e estado geral.' },
  { key: 'head_neck', label: 'Cabeca e pescoco', description: 'Sintomas de vias aereas superiores, face, ouvido e garganta.' },
  { key: 'respiratory', label: 'Respiratorio', description: 'Sintomas pulmonares e respiratorios.' },
  { key: 'cardiovascular', label: 'Cardiovascular', description: 'Sintomas cardiacos e circulatorios.' },
  { key: 'gastrointestinal', label: 'Gastrointestinal', description: 'Sintomas digestivos e abdominais.' },
  { key: 'genitourinary', label: 'Geniturinario', description: 'Sintomas urinarios e genitais.' },
  { key: 'neurological', label: 'Neurologico', description: 'Sintomas do sistema nervoso.' },
  { key: 'psychiatric', label: 'Psiquiatrico', description: 'Humor, sono e sintomas psiquicos.' },
  { key: 'musculoskeletal', label: 'Musculoesqueletico', description: 'Dor muscular, articular e limitacoes.' },
  { key: 'dermatological', label: 'Dermatologico', description: 'Pele, mucosas e anexos.' },
  { key: 'endocrine', label: 'Endocrino e metabolico', description: 'Sede, diurese e sintomas metabolicos.' },
]

const SYMPTOMS: Array<{
  id: string
  label: string
  system: RosSystemKey
  synonyms: string[]
}> = [
  { id: 'febre', label: 'Febre', system: 'general', synonyms: ['febril'] },
  { id: 'calafrios', label: 'Calafrios', system: 'general', synonyms: [] },
  { id: 'perda_peso', label: 'Perda de peso', system: 'general', synonyms: ['emagrecimento'] },
  { id: 'fadiga', label: 'Fadiga', system: 'general', synonyms: ['cansaco'] },
  { id: 'astenia', label: 'Astenia', system: 'general', synonyms: ['fraqueza'] },
  { id: 'odinofagia', label: 'Odinofagia', system: 'head_neck', synonyms: ['dor de garganta'] },
  { id: 'coriza', label: 'Coriza', system: 'head_neck', synonyms: ['nariz escorrendo'] },
  { id: 'congestao_nasal', label: 'Congestao nasal', system: 'head_neck', synonyms: ['nariz entupido'] },
  { id: 'otalgia', label: 'Otalgia', system: 'head_neck', synonyms: ['dor de ouvido'] },
  { id: 'tosse', label: 'Tosse', system: 'respiratory', synonyms: [] },
  { id: 'dispneia', label: 'Dispneia', system: 'respiratory', synonyms: ['falta de ar'] },
  { id: 'sibilos', label: 'Sibilos', system: 'respiratory', synonyms: ['chiado'] },
  { id: 'hemoptise', label: 'Hemoptise', system: 'respiratory', synonyms: ['escarro com sangue'] },
  { id: 'dor_toracica', label: 'Dor toracica', system: 'respiratory', synonyms: ['dor no peito'] },
  { id: 'palpitacoes', label: 'Palpitacoes', system: 'cardiovascular', synonyms: ['coracao acelerado'] },
  { id: 'dor_precordial', label: 'Dor precordial', system: 'cardiovascular', synonyms: ['aperto no peito'] },
  { id: 'edema', label: 'Edema', system: 'cardiovascular', synonyms: ['inchaco'] },
  { id: 'sincope', label: 'Sincope', system: 'cardiovascular', synonyms: ['desmaio'] },
  { id: 'ortopneia', label: 'Ortopneia', system: 'cardiovascular', synonyms: ['falta de ar ao deitar'] },
  { id: 'nausea', label: 'Nausea', system: 'gastrointestinal', synonyms: ['enjoo'] },
  { id: 'vomito', label: 'Vomito', system: 'gastrointestinal', synonyms: ['vomitos'] },
  { id: 'dor_abdominal', label: 'Dor abdominal', system: 'gastrointestinal', synonyms: ['dor na barriga'] },
  { id: 'diarreia', label: 'Diarreia', system: 'gastrointestinal', synonyms: ['intestino solto'] },
  { id: 'constipacao', label: 'Constipacao', system: 'gastrointestinal', synonyms: ['prisao de ventre'] },
  { id: 'hematemese', label: 'Hematemese', system: 'gastrointestinal', synonyms: ['vomito com sangue'] },
  { id: 'disuria', label: 'Disuria', system: 'genitourinary', synonyms: ['ardor ao urinar'] },
  { id: 'polaciuria', label: 'Polaciuria', system: 'genitourinary', synonyms: ['urina frequente'] },
  { id: 'hematuria', label: 'Hematuria', system: 'genitourinary', synonyms: ['sangue na urina'] },
  { id: 'corrimento', label: 'Corrimento', system: 'genitourinary', synonyms: [] },
  { id: 'disfuncao_eretil', label: 'Disfuncao eretil', system: 'genitourinary', synonyms: [] },
  { id: 'cefaleia', label: 'Cefaleia', system: 'neurological', synonyms: ['dor de cabeca'] },
  { id: 'tontura', label: 'Tontura', system: 'neurological', synonyms: [] },
  { id: 'convulsoes', label: 'Convulsoes', system: 'neurological', synonyms: ['convulsao'] },
  { id: 'parestesia', label: 'Parestesia', system: 'neurological', synonyms: ['formigamento'] },
  { id: 'deficit_motor', label: 'Deficit motor', system: 'neurological', synonyms: ['fraqueza focal'] },
  { id: 'ansiedade', label: 'Ansiedade', system: 'psychiatric', synonyms: [] },
  { id: 'depressao', label: 'Depressao', system: 'psychiatric', synonyms: ['humor deprimido'] },
  { id: 'insonia', label: 'Insonia', system: 'psychiatric', synonyms: ['dificuldade para dormir'] },
  { id: 'alteracoes_humor', label: 'Alteracoes de humor', system: 'psychiatric', synonyms: ['oscilacao de humor'] },
  { id: 'alucinacoes', label: 'Alucinacoes', system: 'psychiatric', synonyms: [] },
  { id: 'artralgia', label: 'Artralgia', system: 'musculoskeletal', synonyms: ['dor articular'] },
  { id: 'mialgia', label: 'Mialgia', system: 'musculoskeletal', synonyms: ['dor muscular'] },
  { id: 'rigidez_articular', label: 'Rigidez articular', system: 'musculoskeletal', synonyms: [] },
  { id: 'limitacao_movimento', label: 'Limitacao de movimento', system: 'musculoskeletal', synonyms: ['movimento limitado'] },
  { id: 'rash_cutaneo', label: 'Rash cutaneo', system: 'dermatological', synonyms: ['manchas na pele'] },
  { id: 'prurido', label: 'Prurido', system: 'dermatological', synonyms: ['coceira'] },
  { id: 'ictericia', label: 'Ictericia', system: 'dermatological', synonyms: ['pele amarelada'] },
  { id: 'cianose', label: 'Cianose', system: 'dermatological', synonyms: ['extremidades arroxeadas'] },
  { id: 'poliuria', label: 'Poliuria', system: 'endocrine', synonyms: ['muita urina'] },
  { id: 'polidipsia', label: 'Polidipsia', system: 'endocrine', synonyms: ['muita sede'] },
]

const FIELD_DESCRIPTIONS = [
  { field: 'chiefComplaint', label: 'Queixa principal', section: 'anamnese', aiDescription: 'Motivo principal da consulta em poucas palavras.', captureRules: ['Registrar a queixa principal relatada pelo paciente.'], excludeRules: ['Nao copiar perguntas do medico.'], uiHint: '', examples: ['Dor toracica ha 2 horas'] },
  { field: 'hda', label: 'Historia da doenca atual', section: 'anamnese', aiDescription: 'Resumo cronologico da doenca atual.', captureRules: ['Consolidar inicio, evolucao e sintomas associados.'], excludeRules: ['Nao repetir antecedentes remotos.'], uiHint: '', examples: ['Dor em aperto iniciada hoje, com piora ao esforco'] },
  { field: 'improvingFactors', label: 'Fatores de melhora', section: 'anamnese', aiDescription: 'Tudo o que melhora ou alivia os sintomas.', captureRules: ['Capturar alivio com repouso, remedios ou posturas.'], excludeRules: ['Nao usar ausencia de piora como melhora.'], uiHint: '', examples: ['Melhora com repouso'] },
  { field: 'worseningFactors', label: 'Fatores de piora', section: 'anamnese', aiDescription: 'Tudo o que piora, desencadeia ou agrava os sintomas.', captureRules: ['Capturar esforco, alimentacao, horarios e posturas.'], excludeRules: ['Nao inventar gatilhos.'], uiHint: '', examples: ['Piora ao subir escadas'] },
  { field: 'physicalActivity', label: 'Atividade fisica', section: 'habitos', aiDescription: 'Pratica atual, frequencia, duracao, intensidade, sedentarismo e limitacoes.', captureRules: ['Estruturar o relato em status, modalidade, frequencia e observacoes.'], excludeRules: ['Nao confundir atividade laboral com exercicio formal, a menos que o paciente diga isso.'], uiHint: '', examples: ['Caminha 3x por semana, 40 min'] },
  { field: 'systemsReview', label: 'Revisao de sistemas', section: 'revisao_sistemas', aiDescription: 'Sintomas presentes por sistema, usando tags canonicas.', captureRules: ['Marcar apenas sintomas explicitamente presentes.'], excludeRules: ['Nao marcar negacoes ou sintomas ambiguos.'], uiHint: '', examples: ['Respiratorio: tosse; Neurologico: cefaleia'] },
]

function normalizeToken(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function slugify(value: string) {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'sintoma_livre'
}

function findSystemLabel(system: RosSystemKey) {
  return SYSTEMS.find((item) => item.key === system)?.label || 'Geral'
}

function findCatalogSymptom(value: string, system?: RosSystemKey) {
  const token = normalizeToken(value)
  return (
    SYMPTOMS.find((item) => item.id === token) ||
    SYMPTOMS.find(
      (item) =>
        (!system || item.system === system) &&
        (normalizeToken(item.label) === token ||
          item.synonyms.some((synonym) => normalizeToken(synonym) === token))
    ) ||
    SYMPTOMS.find(
      (item) =>
        normalizeToken(item.label) === token ||
        item.synonyms.some((synonym) => normalizeToken(synonym) === token)
    ) ||
    null
  )
}

function inferSystemFromLabel(label: string): RosSystemKey {
  const matched = findCatalogSymptom(label)
  return matched?.system || 'general'
}

function normalizeSymptomTag(
  value: string | Partial<SymptomTag>,
  defaultSystem: RosSystemKey = 'general'
): SymptomTag {
  const label = typeof value === 'string' ? value : value.label || value.id || ''
  const system = typeof value === 'string' ? defaultSystem : value.system || defaultSystem
  const matched = findCatalogSymptom(label, system)

  if (matched) {
    return {
      id: matched.id,
      label: matched.label,
      system: matched.system,
      source: 'catalog',
      evidence: typeof value === 'string' ? null : value.evidence || null,
    }
  }

  return {
    id: `custom_${slugify(label || findSystemLabel(system))}`,
    label: label.trim() || findSystemLabel(system),
    system: label.trim() ? system : inferSystemFromLabel(label),
    source: 'custom',
    evidence: typeof value === 'string' ? null : value.evidence || null,
  }
}

function dedupeSymptoms(items: SymptomTag[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.system}:${item.id}:${normalizeToken(item.label)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toSymptomList(value: unknown, defaultSystem: RosSystemKey = 'general') {
  if (!Array.isArray(value)) return []
  return dedupeSymptoms(
    value
      .map((item) => {
        if (typeof item === 'string') return normalizeSymptomTag(item, defaultSystem)
        if (item && typeof item === 'object') return normalizeSymptomTag(item as Partial<SymptomTag>, defaultSystem)
        return null
      })
      .filter(Boolean) as SymptomTag[]
  )
}

export function normalizeSystemsReview(value: unknown): Partial<Record<RosSystemKey, SymptomTag[]>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const result: Partial<Record<RosSystemKey, SymptomTag[]>> = {}
  for (const system of SYSTEMS) {
    const items = toSymptomList((value as Record<string, unknown>)[system.key], system.key)
    if (items.length) result[system.key] = items
  }

  return Object.keys(result).length ? result : undefined
}

export function normalizePhysicalActivity(value: unknown): PhysicalActivityData | undefined {
  if (!value) return undefined

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return undefined
    return {
      status: null,
      modalities: [],
      notes: text,
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) return undefined

  const source = value as Record<string, unknown>
  const modalities = Array.isArray(source.modalities)
    ? source.modalities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    status: typeof source.status === 'string' ? source.status : null,
    modalities,
    frequencyPerWeek: typeof source.frequencyPerWeek === 'number' ? source.frequencyPerWeek : null,
    durationMinutes: typeof source.durationMinutes === 'number' ? source.durationMinutes : null,
    intensity: typeof source.intensity === 'string' ? source.intensity : null,
    sedentaryTime: typeof source.sedentaryTime === 'string' ? source.sedentaryTime : null,
    limitations: typeof source.limitations === 'string' ? source.limitations : null,
    notes: typeof source.notes === 'string' ? source.notes : null,
  }
}

export function normalizeExtractedData(value: LegacyExtractedData | Record<string, unknown> | null | undefined): NormalizedExtractedData {
  if (!value || typeof value !== 'object') return {}

  const extracted = value as Record<string, unknown>
  const symptoms = toSymptomList(extracted.symptoms)
  const systemsReview = normalizeSystemsReview(extracted.systemsReview)
  const flattenedSystemSymptoms = systemsReview ? Object.values(systemsReview).flatMap((items) => items || []) : []

  const mergedSymptoms = dedupeSymptoms([...symptoms, ...flattenedSystemSymptoms])

  return {
    chiefComplaint: typeof extracted.chiefComplaint === 'string' ? extracted.chiefComplaint : undefined,
    hda: typeof extracted.hda === 'string' ? extracted.hda : undefined,
    symptomStart: typeof extracted.symptomStart === 'string' ? extracted.symptomStart : undefined,
    symptomIntensity: typeof extracted.symptomIntensity === 'string' ? extracted.symptomIntensity : undefined,
    symptoms: mergedSymptoms.length ? mergedSymptoms : undefined,
    improvingFactors: typeof extracted.improvingFactors === 'string' ? extracted.improvingFactors : undefined,
    worseningFactors: typeof extracted.worseningFactors === 'string' ? extracted.worseningFactors : undefined,
    previousDiseases: Array.isArray(extracted.previousDiseases) ? extracted.previousDiseases.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined,
    surgeries: Array.isArray(extracted.surgeries) ? extracted.surgeries.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined,
    hospitalizations: Array.isArray(extracted.hospitalizations) ? extracted.hospitalizations.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined,
    allergiesDetails: Array.isArray(extracted.allergiesDetails) ? extracted.allergiesDetails as Array<{ substance: string; reaction: string }> : undefined,
    currentMedications: Array.isArray(extracted.currentMedications) ? extracted.currentMedications as Array<{ name: string; dose: string; frequency: string; route: string }> : undefined,
    familyHistory: extracted.familyHistory && typeof extracted.familyHistory === 'object' ? extracted.familyHistory as NormalizedExtractedData['familyHistory'] : undefined,
    smoking: typeof extracted.smoking === 'string' ? extracted.smoking : undefined,
    alcohol: typeof extracted.alcohol === 'string' ? extracted.alcohol : undefined,
    physicalActivity: normalizePhysicalActivity(extracted.physicalActivity),
    sleep: typeof extracted.sleep === 'string' ? extracted.sleep : undefined,
    diet: typeof extracted.diet === 'string' ? extracted.diet : undefined,
    drugs: typeof extracted.drugs === 'string' ? extracted.drugs : undefined,
    occupation: typeof extracted.occupation === 'string' ? extracted.occupation : undefined,
    vitalSigns: extracted.vitalSigns && typeof extracted.vitalSigns === 'object' ? extracted.vitalSigns as NormalizedExtractedData['vitalSigns'] : undefined,
    weight: typeof extracted.weight === 'number' ? extracted.weight : undefined,
    height: typeof extracted.height === 'number' ? extracted.height : undefined,
    generalState: typeof extracted.generalState === 'string' ? extracted.generalState : undefined,
    physicalExam: extracted.physicalExam && typeof extracted.physicalExam === 'object' ? extracted.physicalExam as NormalizedExtractedData['physicalExam'] : undefined,
    mainHypothesis: typeof extracted.mainHypothesis === 'string' ? extracted.mainHypothesis : undefined,
    differentials: Array.isArray(extracted.differentials) ? extracted.differentials.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : undefined,
    confirmedDiagnosis: typeof extracted.confirmedDiagnosis === 'string' ? extracted.confirmedDiagnosis : undefined,
    cid: Array.isArray(extracted.cid) ? extracted.cid as Array<{ code: string; description: string }> : undefined,
    therapeuticPlan: typeof extracted.therapeuticPlan === 'string' ? extracted.therapeuticPlan : undefined,
    orientations: typeof extracted.orientations === 'string' ? extracted.orientations : undefined,
    referrals: typeof extracted.referrals === 'string' ? extracted.referrals : undefined,
    followUpDate: typeof extracted.followUpDate === 'string' ? extracted.followUpDate : undefined,
    systemsReview,
    currentSection: typeof extracted.currentSection === 'string' ? extracted.currentSection : undefined,
  }
}

export function getClinicalCatalog() {
  return {
    version: 'legacy-services-compatible',
    context: 'aps_clinica_geral',
    autoFillPolicy: {
      mode: 'high_signal_only',
      minConfidence: 0.82,
    },
    systems: SYSTEMS,
    fields: FIELD_DESCRIPTIONS,
    symptoms: SYMPTOMS.map((item) => ({
      id: item.id,
      label: item.label,
      system: item.system,
      aiDescription: `Sintoma do sistema ${findSystemLabel(item.system).toLowerCase()}.`,
      synonyms: item.synonyms,
    })),
  }
}
