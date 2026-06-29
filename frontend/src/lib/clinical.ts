import {
  ClinicalCatalog,
  ExtractionState,
  FieldSuggestion,
  PhysicalActivityData,
  RosSystemKey,
  SymptomCatalogEntry,
  SymptomTag,
} from '@/types'
import { parseJson } from '@/components/shared/utils'

export const EMPTY_CLINICAL_CATALOG: ClinicalCatalog = {
  version: 'local-empty',
  context: 'aps_clinica_geral',
  autoFillPolicy: { mode: 'high_signal_only', minConfidence: 0.82 },
  systems: [],
  fields: [],
  symptoms: [],
}

export function normalizeToken(value: string) {
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

function findCatalogSymptom(value: string, catalog?: ClinicalCatalog, system?: RosSystemKey) {
  if (!catalog) return null
  const token = normalizeToken(value)
  return (
    catalog.symptoms.find((item) => normalizeToken(item.id) === token) ||
    catalog.symptoms.find(
      (item) =>
        (!system || item.system === system) &&
        (normalizeToken(item.label) === token ||
          item.synonyms.some((synonym) => normalizeToken(synonym) === token))
    ) ||
    catalog.symptoms.find(
      (item) =>
        normalizeToken(item.label) === token ||
        item.synonyms.some((synonym) => normalizeToken(synonym) === token)
    ) ||
    null
  )
}

export function normalizeSymptomTag(
  value: string | Partial<SymptomTag>,
  catalog?: ClinicalCatalog,
  defaultSystem: RosSystemKey = 'general'
): SymptomTag {
  const label = typeof value === 'string' ? value : value.label || value.id || ''
  const system = typeof value === 'string' ? defaultSystem : value.system || defaultSystem
  const matched =
    (typeof value !== 'string' && value.id
      ? catalog?.symptoms.find((item) => item.id === value.id) || null
      : null) || findCatalogSymptom(label, catalog, system)

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
    id: `custom_${slugify(label)}`,
    label: label.trim() || 'Sintoma livre',
    system,
    source: 'custom',
    evidence: typeof value === 'string' ? null : value.evidence || null,
  }
}

function dedupeSymptoms(items: SymptomTag[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.system}:${item.id}:${item.label.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function parseSymptomTags(
  value?: string | Array<string | SymptomTag | Partial<SymptomTag>> | null,
  catalog?: ClinicalCatalog,
  defaultSystem: RosSystemKey = 'general'
) {
  const parsed = Array.isArray(value) ? value : parseJson<unknown[]>(value, [])
  return dedupeSymptoms(
    parsed
      .map((item) => {
        if (typeof item === 'string') return normalizeSymptomTag(item, catalog, defaultSystem)
        if (item && typeof item === 'object') return normalizeSymptomTag(item as Partial<SymptomTag>, catalog, defaultSystem)
        return null
      })
      .filter(Boolean) as SymptomTag[]
  )
}

export function parseSystemsReview(
  value?: string | Partial<Record<RosSystemKey, SymptomTag[]>> | null,
  catalog?: ClinicalCatalog
) {
  const parsed = typeof value === 'string' ? parseJson<Record<string, unknown>>(value, {}) : value || {}
  const result: Partial<Record<RosSystemKey, SymptomTag[]>> = {}
  const systems = new Set<RosSystemKey>([
    'general',
    'head_neck',
    'respiratory',
    'cardiovascular',
    'gastrointestinal',
    'genitourinary',
    'neurological',
    'psychiatric',
    'musculoskeletal',
    'dermatological',
    'endocrine',
  ])

  for (const key of systems) {
    const items = parseSymptomTags(
      (parsed as Record<string, unknown>)[key] as Array<string | SymptomTag | Partial<SymptomTag>> | string | null,
      catalog,
      key
    )
    if (items.length) result[key] = items
  }

  return result
}

export function flattenSystemsReview(review: Partial<Record<RosSystemKey, SymptomTag[]>>) {
  return dedupeSymptoms(Object.values(review).flatMap((items) => items || []))
}

export function parsePhysicalActivity(value?: string | PhysicalActivityData | null): PhysicalActivityData {
  if (!value) return { modalities: [] }
  if (typeof value === 'string') {
    const parsed = parseJson<Record<string, unknown> | null>(value, null)
    if (parsed && typeof parsed === 'object') {
      return parsePhysicalActivity(parsed as PhysicalActivityData)
    }
    return { notes: value, modalities: [] }
  }

  const modalities = Array.isArray(value.modalities)
    ? value.modalities.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  return {
    status: value.status || null,
    modalities,
    frequencyPerWeek:
      typeof value.frequencyPerWeek === 'number' ? value.frequencyPerWeek : value.frequencyPerWeek ?? null,
    durationMinutes:
      typeof value.durationMinutes === 'number' ? value.durationMinutes : value.durationMinutes ?? null,
    intensity: value.intensity || null,
    sedentaryTime: value.sedentaryTime || null,
    limitations: value.limitations || null,
    notes: value.notes || null,
  }
}

export function serializeSymptomTags(items: SymptomTag[]) {
  return JSON.stringify(dedupeSymptoms(items))
}

export function serializeSystemsReview(review: Partial<Record<RosSystemKey, SymptomTag[]>>) {
  const cleaned = Object.fromEntries(
    Object.entries(review)
      .map(([key, items]) => [key, dedupeSymptoms(items || [])])
      .filter(([, items]) => items.length > 0)
  )
  return JSON.stringify(cleaned)
}

export function serializePhysicalActivity(value: PhysicalActivityData) {
  return JSON.stringify(parsePhysicalActivity(value))
}

export function parseExtractionState(value?: string | null): ExtractionState {
  const parsed = parseJson<ExtractionState | null>(value, null)
  return {
    lastAnalyzedSeq: parsed?.lastAnalyzedSeq || 0,
    fields: parsed?.fields || {},
    suggestions: Array.isArray(parsed?.suggestions) ? parsed!.suggestions : [],
    conflicts: Array.isArray(parsed?.conflicts) ? parsed!.conflicts : [],
    updatedAt: parsed?.updatedAt,
  }
}

export function systemSymptoms(catalog: ClinicalCatalog | null | undefined, system: RosSystemKey) {
  return catalog?.symptoms.filter((item) => item.system === system) || []
}

export function systemLabel(catalog: ClinicalCatalog | null | undefined, system: RosSystemKey) {
  return catalog?.systems.find((item) => item.key === system)?.label || system
}

export function isCatalogSymptom(
  symptom: SymptomTag,
  options: SymptomCatalogEntry[]
) {
  return options.some((item) => item.id === symptom.id)
}
