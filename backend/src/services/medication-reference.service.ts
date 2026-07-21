import { createHash } from 'crypto'
import OpenAI from 'openai'

let openai: OpenAI | null = null

function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

export interface MedicationReference {
  found: boolean
  searchedName: string
  normalizedName: string | null
  activeIngredient: string | null
  description: string | null
  importantFacts: string[]
  sourceTitle: string | null
  sourceUrl: string | null
  consultedAt: string
  reviewStatus: 'revisao_obrigatoria'
}

interface RawMedicationReference {
  found: boolean
  normalizedName: string | null
  activeIngredient: string | null
  description: string | null
  importantFacts: string[]
  sourceTitle: string | null
  sourceUrl: string | null
}

const ANVISA_HOST_SUFFIX = 'anvisa.gov.br'

function normalizeMedicationName(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s._+\-/]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

function isAllowedSource(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLocaleLowerCase('pt-BR')
    if (host === ANVISA_HOST_SUFFIX || host.endsWith(`.${ANVISA_HOST_SUFFIX}`)) return true
    return (host === 'gov.br' || host === 'www.gov.br') && /^\/anvisa(?:\/|$)/i.test(url.pathname)
  } catch {
    return false
  }
}

function collectOfficialSources(value: unknown, result = new Set<string>()) {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && isAllowedSource(value)) result.add(value)
    return result
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectOfficialSources(item, result))
    return result
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => collectOfficialSources(item, result))
  }
  return result
}

const MEDICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    found: { type: 'boolean' },
    normalizedName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    activeIngredient: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    importantFacts: { type: 'array', items: { type: 'string' } },
    sourceTitle: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    sourceUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'found',
    'normalizedName',
    'activeIngredient',
    'description',
    'importantFacts',
    'sourceTitle',
    'sourceUrl',
  ],
} as const

/**
 * Consulta somente o nome do medicamento. Nenhum dado da consulta ou do paciente
 * e enviado para a busca externa.
 */
export async function findMedicationReference(
  medicationName: string,
  ownerId: string
): Promise<MedicationReference> {
  const searchedName = normalizeMedicationName(medicationName)
  if (searchedName.length < 2) throw new Error('Informe um nome de medicamento valido')
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nao configurada')

  const model = process.env.OPENAI_MEDICATION_MODEL || process.env.OPENAI_DYNAMIC_INCREMENTAL_MODEL || 'gpt-5.6-terra'
  const requestBody: Record<string, unknown> = {
    model,
    store: false,
    reasoning: { effort: 'low' },
    instructions: `Consulte apenas fontes oficiais da Anvisa para identificar o medicamento informado.
Nao use dados do paciente. Nao recomende tratamento, nao prescreva e nao complete informacoes sem fonte.
Resuma somente descricao geral e fatos regulatórios importantes. Se nao houver uma fonte oficial verificavel, retorne found=false.`,
    input: `Nome isolado informado: ${searchedName}`,
    tools: [{
      type: 'web_search',
      filters: { allowed_domains: ['www.gov.br', 'anvisa.gov.br', 'consultas.anvisa.gov.br'] },
      external_web_access: true,
    }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        name: 'anvisa_medication_reference',
        description: 'Referencia oficial de medicamento sujeita a revisao profissional',
        strict: true,
        schema: MEDICATION_SCHEMA,
      },
    },
    prompt_cache_key: createHash('sha256').update(`medication-reference:${ownerId}`).digest('hex'),
    safety_identifier: createHash('sha256').update(ownerId).digest('hex'),
    max_output_tokens: 1800,
  }

  const response = await getOpenAI().responses.create(requestBody as never)
  let parsed: RawMedicationReference
  try {
    parsed = JSON.parse(response.output_text || '{}') as RawMedicationReference
  } catch {
    throw new Error('A consulta farmacologica retornou um formato invalido')
  }

  const officialSources = Array.from(collectOfficialSources(response.output))
  const claimedSource = parsed.sourceUrl && isAllowedSource(parsed.sourceUrl)
    ? parsed.sourceUrl
    : null
  const verifiedSource = claimedSource && officialSources.includes(claimedSource)
    ? claimedSource
    : officialSources[0] || null
  const found = Boolean(parsed.found && verifiedSource && parsed.description?.trim())

  return {
    found,
    searchedName,
    normalizedName: found ? parsed.normalizedName?.trim() || searchedName : null,
    activeIngredient: found ? parsed.activeIngredient?.trim() || null : null,
    description: found ? parsed.description?.trim() || null : null,
    importantFacts: found
      ? (Array.isArray(parsed.importantFacts) ? parsed.importantFacts : []).filter(Boolean).slice(0, 8)
      : [],
    sourceTitle: found ? parsed.sourceTitle?.trim() || 'Fonte oficial da Anvisa' : null,
    sourceUrl: found ? verifiedSource : null,
    consultedAt: new Date().toISOString(),
    reviewStatus: 'revisao_obrigatoria',
  }
}
