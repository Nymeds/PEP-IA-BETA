import { z } from 'zod'

export const CLINICAL_FORM_SCHEMA_VERSION = 'clinical-form-v1' as const

export const CLINICAL_DOCUMENT_KINDS = ['compartilhavel', 'restrito'] as const
export const CLINICAL_DOCUMENT_FORMATS = ['SOAP', 'DAP', 'BIRP'] as const
export const CLINICAL_FIELD_TYPES = [
  'texto_curto',
  'texto_longo',
  'checkbox',
  'selecao_unica',
  'selecao_multipla',
  'numero',
  'data',
  'titulo',
  'divisor',
  'grupo_repetivel',
] as const
export const CLINICAL_AI_MODES = [
  'sem_acesso',
  'preencher',
  'resumir',
  'sugerir_revisao',
] as const
export const CLINICAL_COLOR_TOKENS = [
  'azul',
  'verde',
  'amarelo',
  'vermelho',
  'roxo',
  'cinza',
  'turquesa',
  'rosa',
] as const

export const CLINICAL_SEMANTIC_ROLES = [
  'identificacao',
  'enquadramento_consentimentos',
  'demanda_objetivos',
  'contexto_funcionamento',
  'familiares_rede',
  'medicamentos',
  'evolucao_procedimentos',
  'risco_protecao',
  'encaminhamento_encerramento',
  'documentos_emitidos',
  'formulacao_hipoteses',
  'observacoes_estado_mental',
  'avaliacao_risco_detalhada',
  'materiais_avaliacao_psicologica',
  'anotacoes_tecnicas',
  'outros',
] as const

export const REQUIRED_PSYCHOLOGY_ROLES = [
  'identificacao',
  'demanda_objetivos',
  'evolucao_procedimentos',
  'encaminhamento_encerramento',
  'documentos_emitidos',
  'materiais_avaliacao_psicologica',
] as const

const REVIEW_ONLY_SEMANTIC_ROLES = new Set([
  'medicamentos',
  'risco_protecao',
  'avaliacao_risco_detalhada',
  'formulacao_hipoteses',
  'materiais_avaliacao_psicologica',
  'encaminhamento_encerramento',
])

const safeIdSchema = z
  .string()
  .trim()
  .min(1, 'Informe um identificador')
  .max(80, 'O identificador deve ter no maximo 80 caracteres')
  .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Use apenas letras minusculas, numeros, _ ou - no identificador')

const shortTextSchema = z.string().trim().min(1).max(120)
const descriptionSchema = z.string().trim().min(10).max(2000)
const guidanceListSchema = z.array(z.string().trim().min(3).max(500)).min(1).max(12)

function requireAiPolicyDocumentation(
  policy: {
    mode: (typeof CLINICAL_AI_MODES)[number]
    description?: string
    allowedEvidence?: string[]
    prohibitedInferences?: string[]
    expectedFormat?: string
    examples?: string[]
    counterexamples?: string[]
  },
  context: z.RefinementCtx
) {
  if (policy.mode === 'sem_acesso') return
  const required: Array<[keyof typeof policy, string]> = [
    ['description', 'Informe o significado clinico do campo para a IA'],
    ['allowedEvidence', 'Informe as evidencias que a IA pode utilizar'],
    ['prohibitedInferences', 'Informe as inferencias proibidas para a IA'],
    ['expectedFormat', 'Informe o formato esperado do campo'],
    ['examples', 'Informe ao menos um exemplo valido'],
    ['counterexamples', 'Informe ao menos um contraexemplo'],
  ]
  for (const [key, message] of required) {
    const value = policy[key]
    if (!value || (Array.isArray(value) && value.length === 0)) {
      context.addIssue({ code: 'custom', path: [key], message })
    }
  }
}

const aiPolicySchema = z
  .object({
    mode: z.enum(CLINICAL_AI_MODES),
    description: descriptionSchema.optional(),
    allowedEvidence: guidanceListSchema.optional(),
    prohibitedInferences: guidanceListSchema.optional(),
    expectedFormat: z.string().trim().min(3).max(500).optional(),
    examples: guidanceListSchema.optional(),
    counterexamples: guidanceListSchema.optional(),
  })
  .strict()
  .superRefine(requireAiPolicyDocumentation)

// O rascunho aceita configuracoes intermediarias; as obrigacoes clinicas sao
// verificadas somente por parseFormDefinition no momento da publicacao.
const draftAiPolicySchema = z
  .object({
    mode: z.enum(CLINICAL_AI_MODES),
    description: z.string().trim().max(2000).optional(),
    allowedEvidence: z.array(z.string().trim().max(500)).max(12).optional(),
    prohibitedInferences: z.array(z.string().trim().max(500)).max(12).optional(),
    expectedFormat: z.string().trim().max(500).optional(),
    examples: z.array(z.string().trim().max(500)).max(12).optional(),
    counterexamples: z.array(z.string().trim().max(500)).max(12).optional(),
  })
  .strict()

const optionSchema = z
  .object({
    id: safeIdSchema,
    label: shortTextSchema,
  })
  .strict()

const draftOptionSchema = z
  .object({
    id: safeIdSchema,
    label: z.string().trim().max(120),
  })
  .strict()

const repeaterColumnSchema = z
  .object({
    id: safeIdSchema,
    label: shortTextSchema,
    type: z.enum([
      'texto_curto',
      'texto_longo',
      'checkbox',
      'selecao_unica',
      'selecao_multipla',
      'numero',
      'data',
    ]),
    required: z.boolean().default(false),
    options: z.array(optionSchema).min(2).max(50).optional(),
    ai: aiPolicySchema,
  })
  .strict()
  .superRefine((column, context) => {
    const needsOptions = column.type === 'selecao_unica' || column.type === 'selecao_multipla'
    if (needsOptions && (!column.options || column.options.length < 2)) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Campos de selecao precisam ter ao menos duas opcoes',
      })
    }
    const optionIds = new Set<string>()
    for (const [index, option] of (column.options || []).entries()) {
      if (optionIds.has(option.id)) {
        context.addIssue({ code: 'custom', path: ['options', index, 'id'], message: 'Identificador de opcao duplicado' })
      }
      optionIds.add(option.id)
    }
  })

const draftRepeaterColumnSchema = z
  .object({
    id: safeIdSchema,
    label: z.string().trim().max(120),
    type: z.enum([
      'texto_curto',
      'texto_longo',
      'checkbox',
      'selecao_unica',
      'selecao_multipla',
      'numero',
      'data',
    ]),
    required: z.boolean().default(false),
    options: z.array(draftOptionSchema).max(50).optional(),
    ai: draftAiPolicySchema,
  })
  .strict()

const layoutSchema = z
  .object({
    x: z.number().int().min(0).max(10000),
    y: z.number().int().min(0).max(100000),
    width: z.number().int().min(40).max(10000),
    height: z.number().int().min(24).max(10000),
    zIndex: z.number().int().min(0).max(1000).default(0),
    mobileOrder: z.number().int().min(0).max(10000),
  })
  .strict()

const CLINICAL_FORM_CANVAS_WIDTH = 1200
const CLINICAL_FORM_LAYOUT_GAP = 16

function clinicalLayoutsOverlap(
  first: z.infer<typeof layoutSchema>,
  second: z.infer<typeof layoutSchema>
) {
  return !(
    first.x + first.width + CLINICAL_FORM_LAYOUT_GAP <= second.x ||
    second.x + second.width + CLINICAL_FORM_LAYOUT_GAP <= first.x ||
    first.y + first.height + CLINICAL_FORM_LAYOUT_GAP <= second.y ||
    second.y + second.height + CLINICAL_FORM_LAYOUT_GAP <= first.y
  )
}

const fieldValidationSchema = z
  .object({
    minLength: z.number().int().min(0).max(100000).optional(),
    maxLength: z.number().int().min(1).max(100000).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict()
  .superRefine((validation, context) => {
    if (validation.minLength != null && validation.maxLength != null && validation.minLength > validation.maxLength) {
      context.addIssue({ code: 'custom', message: 'minLength nao pode ser maior que maxLength' })
    }
    if (validation.min != null && validation.max != null && validation.min > validation.max) {
      context.addIssue({ code: 'custom', message: 'min nao pode ser maior que max' })
    }
  })

const fieldRelationshipSchema = z
  .object({
    fieldId: safeIdSchema,
    kind: z.enum(['depende_de', 'correlaciona_com', 'exclusivo_com', 'deriva_de']),
    description: z.string().trim().min(3).max(500).optional(),
  })
  .strict()

const fieldSchema = z
  .object({
    id: safeIdSchema,
    type: z.enum(CLINICAL_FIELD_TYPES),
    label: shortTextSchema,
    helpText: z.string().trim().max(500).optional(),
    color: z.enum(CLINICAL_COLOR_TOKENS).default('azul'),
    required: z.boolean().default(false),
    semanticRole: z.enum(CLINICAL_SEMANTIC_ROLES).optional(),
    validation: fieldValidationSchema.optional(),
    relationships: z.array(fieldRelationshipSchema).max(30).optional(),
    layout: layoutSchema,
    options: z.array(optionSchema).min(2).max(50).optional(),
    columns: z.array(repeaterColumnSchema).min(1).max(30).optional(),
    ai: aiPolicySchema,
  })
  .strict()
  .superRefine((field, context) => {
    const needsOptions = field.type === 'selecao_unica' || field.type === 'selecao_multipla'
    if (needsOptions && (!field.options || field.options.length < 2)) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Campos de selecao precisam ter ao menos duas opcoes',
      })
    }
    if (field.type === 'grupo_repetivel' && (!field.columns || field.columns.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['columns'],
        message: 'Grupos repetiveis precisam ter ao menos uma coluna',
      })
    }
    if ((field.type === 'titulo' || field.type === 'divisor') && field.ai.mode !== 'sem_acesso') {
      context.addIssue({
        code: 'custom',
        path: ['ai', 'mode'],
        message: 'Titulos e divisores nao podem ser manipulados pela IA',
      })
    }
    if ((field.type === 'titulo' || field.type === 'divisor') && field.semanticRole) {
      context.addIssue({
        code: 'custom',
        path: ['semanticRole'],
        message: 'Titulos e divisores nao podem cumprir papel documental clinico',
      })
    }
    if (field.type !== 'titulo' && field.type !== 'divisor' && !field.semanticRole) {
      context.addIssue({
        code: 'custom',
        path: ['semanticRole'],
        message: 'Todo campo clinico precisa declarar seu papel semantico',
      })
    }
    const optionIds = new Set<string>()
    for (const [index, option] of (field.options || []).entries()) {
      if (optionIds.has(option.id)) {
        context.addIssue({ code: 'custom', path: ['options', index, 'id'], message: 'Identificador de opcao duplicado' })
      }
      optionIds.add(option.id)
    }
  })

const draftFieldSchema = z
  .object({
    id: safeIdSchema,
    type: z.enum(CLINICAL_FIELD_TYPES),
    label: z.string().trim().max(120),
    helpText: z.string().trim().max(500).optional(),
    color: z.enum(CLINICAL_COLOR_TOKENS).default('azul'),
    required: z.boolean().default(false),
    semanticRole: z.enum(CLINICAL_SEMANTIC_ROLES).optional(),
    validation: fieldValidationSchema.optional(),
    relationships: z.array(fieldRelationshipSchema).max(30).optional(),
    layout: layoutSchema,
    options: z.array(draftOptionSchema).max(50).optional(),
    columns: z.array(draftRepeaterColumnSchema).max(30).optional(),
    ai: draftAiPolicySchema,
  })
  .strict()

const tabSchema = z
  .object({
    id: safeIdSchema,
    label: shortTextSchema,
    icon: z.string().trim().min(1).max(60),
    color: z.enum(CLINICAL_COLOR_TOKENS),
    elements: z.array(fieldSchema).min(1).max(200),
  })
  .strict()

const documentSchema = z
  .object({
    id: safeIdSchema,
    kind: z.enum(CLINICAL_DOCUMENT_KINDS),
    label: shortTextSchema,
    icon: z.string().trim().min(1).max(60),
    color: z.enum(CLINICAL_COLOR_TOKENS),
    tabs: z.array(tabSchema).min(1).max(40),
  })
  .strict()

const draftTabSchema = z
  .object({
    id: safeIdSchema,
    label: z.string().trim().max(120),
    icon: z.string().trim().max(60),
    color: z.enum(CLINICAL_COLOR_TOKENS),
    elements: z.array(draftFieldSchema).max(200),
  })
  .strict()

const draftDocumentSchema = z
  .object({
    id: safeIdSchema,
    kind: z.enum(CLINICAL_DOCUMENT_KINDS),
    label: z.string().trim().max(120),
    icon: z.string().trim().max(60),
    color: z.enum(CLINICAL_COLOR_TOKENS),
    tabs: z.array(draftTabSchema).max(40),
  })
  .strict()

const baseFormDefinitionSchema = z
  .object({
    schemaVersion: z.literal(CLINICAL_FORM_SCHEMA_VERSION),
    name: shortTextSchema,
    specialtyCode: safeIdSchema,
    defaultDocumentFormat: z.enum(CLINICAL_DOCUMENT_FORMATS),
    documents: z.array(documentSchema).length(2, 'O formulario precisa ter exatamente dois documentos'),
  })
  .strict()

const draftFormDefinitionSchema = z
  .object({
    schemaVersion: z.literal(CLINICAL_FORM_SCHEMA_VERSION),
    name: z.string().trim().min(1).max(120),
    specialtyCode: safeIdSchema,
    defaultDocumentFormat: z.enum(CLINICAL_DOCUMENT_FORMATS),
    documents: z.array(draftDocumentSchema).length(2),
  })
  .strict()

const formDefinitionSchema = baseFormDefinitionSchema.superRefine((definition, context) => {
    const documentKinds = new Set(definition.documents.map((document) => document.kind))
    for (const kind of CLINICAL_DOCUMENT_KINDS) {
      if (!documentKinds.has(kind)) {
        context.addIssue({
          code: 'custom',
          path: ['documents'],
          message: `Inclua o documento ${kind}`,
        })
      }
    }

    const identifiers = new Set<string>()
    const fieldIds = new Set<string>()
    const fieldDocumentKinds = new Map<string, string>()
    const duplicatedIdentifiers = new Set<string>()
    const roleLocations = new Map<string, Set<string>>()
    let totalFields = 0
    for (const document of definition.documents) {
      const documentKey = `documento:${document.id}`
      if (identifiers.has(documentKey)) duplicatedIdentifiers.add(document.id)
      identifiers.add(documentKey)
      for (const tab of document.tabs) {
        const tabKey = `aba:${tab.id}`
        if (identifiers.has(tabKey)) duplicatedIdentifiers.add(tab.id)
        identifiers.add(tabKey)

        for (const [fieldIndex, field] of tab.elements.entries()) {
          if (field.layout.x + field.layout.width > CLINICAL_FORM_CANVAS_WIDTH) {
            context.addIssue({
              code: 'custom',
              path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'layout'],
              message: `O campo precisa permanecer dentro do canvas de ${CLINICAL_FORM_CANVAS_WIDTH} px`,
            })
          }
          for (const other of tab.elements.slice(fieldIndex + 1)) {
            if (clinicalLayoutsOverlap(field.layout, other.layout)) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', other.id, 'layout'],
                message: `Os campos ${field.label} e ${other.label} nao podem se sobrepor e precisam manter ${CLINICAL_FORM_LAYOUT_GAP} px de distancia`,
              })
            }
          }
        }

        for (const field of tab.elements) {
          totalFields += 1
          const fieldKey = `campo:${field.id}`
          if (identifiers.has(fieldKey)) duplicatedIdentifiers.add(field.id)
          identifiers.add(fieldKey)
          fieldIds.add(field.id)
          fieldDocumentKinds.set(field.id, document.kind)
          if (field.semanticRole) {
            const locations = roleLocations.get(field.semanticRole) || new Set<string>()
            locations.add(document.kind)
            roleLocations.set(field.semanticRole, locations)
            if (
              (REVIEW_ONLY_SEMANTIC_ROLES.has(field.semanticRole) || field.semanticRole === 'outros') &&
              field.ai.mode !== 'sem_acesso' &&
              field.ai.mode !== 'sugerir_revisao'
            ) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'ai', 'mode'],
                message: `O papel ${field.semanticRole} so pode ficar sem acesso ou sugerir para revisao`,
              })
            }
          }

          const columnIds = new Set<string>()
          for (const column of field.columns || []) {
            if (columnIds.has(column.id)) duplicatedIdentifiers.add(`${field.id}.${column.id}`)
            columnIds.add(column.id)
          }
        }
      }
    }

    if (totalFields > 1_000) {
      context.addIssue({
        code: 'custom',
        path: ['documents'],
        message: 'O formulario pode ter no maximo 1000 elementos',
      })
    }

    if (duplicatedIdentifiers.size > 0) {
      context.addIssue({
        code: 'custom',
        path: ['documents'],
        message: `Existem identificadores duplicados: ${Array.from(duplicatedIdentifiers).join(', ')}`,
      })
    }

    for (const document of definition.documents) {
      for (const tab of document.tabs) {
        for (const field of tab.elements) {
          const relationshipKeys = new Set<string>()
          for (const [relationshipIndex, relationship] of (field.relationships || []).entries()) {
            const relationshipKey = `${relationship.kind}:${relationship.fieldId}`
            if (relationshipKeys.has(relationshipKey)) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'relationships', relationshipIndex],
                message: 'Este relacionamento esta duplicado',
              })
            }
            relationshipKeys.add(relationshipKey)
            if (relationship.fieldId === field.id) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'relationships', relationshipIndex],
                message: 'Um campo nao pode se relacionar consigo mesmo',
              })
            } else if (!fieldIds.has(relationship.fieldId)) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'relationships', relationshipIndex],
                message: `O campo relacionado ${relationship.fieldId} nao existe nesta versao`,
              })
            } else if (fieldDocumentKinds.get(relationship.fieldId) !== document.kind) {
              context.addIssue({
                code: 'custom',
                path: ['documents', document.id, 'tabs', tab.id, 'elements', field.id, 'relationships', relationshipIndex],
                message: 'Relacionamentos entre prontuario compartilhavel e registro restrito nao sao permitidos',
              })
            }
          }
        }
      }
    }

    for (const role of REQUIRED_PSYCHOLOGY_ROLES) {
      if (!roleLocations.has(role)) {
        context.addIssue({
          code: 'custom',
          path: ['documents'],
          message: `Inclua um campo com o papel obrigatorio ${role}`,
        })
      }
    }

    const sharedRequiredRoles = REQUIRED_PSYCHOLOGY_ROLES.filter(
      (role) => role !== 'materiais_avaliacao_psicologica'
    )
    for (const role of sharedRequiredRoles) {
      if (!roleLocations.get(role)?.has('compartilhavel')) {
        context.addIssue({
          code: 'custom',
          path: ['documents'],
          message: `O papel ${role} precisa existir no prontuario compartilhavel`,
        })
      }
    }

    if (!roleLocations.get('materiais_avaliacao_psicologica')?.has('restrito')) {
      context.addIssue({
        code: 'custom',
        path: ['documents'],
        message: 'Materiais de avaliacao psicologica precisam permanecer no documento restrito',
      })
    }
  })

export type ClinicalFormDefinition = z.infer<typeof formDefinitionSchema>
export type ClinicalDocumentDefinition = z.infer<typeof documentSchema>
export type ClinicalFieldDefinition = z.infer<typeof fieldSchema>
export type ClinicalAiPolicy = z.infer<typeof aiPolicySchema>

export interface FormRuntimeManifest {
  schemaVersion: typeof CLINICAL_FORM_SCHEMA_VERSION
  specialtyCode: string
  templateName: string
  defaultDocumentFormat: (typeof CLINICAL_DOCUMENT_FORMATS)[number]
  documents: Array<{
    id: string
    kind: (typeof CLINICAL_DOCUMENT_KINDS)[number]
    label: string
    fields: Array<{
      id: string
      tabId: string
      label: string
      type: (typeof CLINICAL_FIELD_TYPES)[number]
      semanticRole?: (typeof CLINICAL_SEMANTIC_ROLES)[number]
      required: boolean
      validation?: ClinicalFieldDefinition['validation']
      relationships?: ClinicalFieldDefinition['relationships']
      ai: ClinicalAiPolicy
      options?: ClinicalFieldDefinition['options']
      columns?: ClinicalFieldDefinition['columns']
    }>
  }>
}

export class ClinicalFormValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues.join('; '))
    this.name = 'ClinicalFormValidationError'
    this.issues = issues
  }
}

function sanitizeUntrustedText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/```(?:json|text|markdown)?/gi, '')
    .trim()
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 20) {
    throw new ClinicalFormValidationError(['A definicao do formulario possui aninhamento excessivo'])
  }
  if (typeof value === 'string') return sanitizeUntrustedText(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeUnknown(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizeUnknown(item, depth + 1)])
    )
  }
  return value
}

export function parseFormDefinition(input: unknown): ClinicalFormDefinition {
  return parseWithSchema(input, formDefinitionSchema)
}

// Rascunhos podem omitir papeis regulatorios; a publicacao usa parseFormDefinition.
export function parseDraftFormDefinition(input: unknown): ClinicalFormDefinition {
  return parseWithSchema(input, draftFormDefinitionSchema)
}

function parseWithSchema(
  input: unknown,
  schema: z.ZodType<ClinicalFormDefinition>
): ClinicalFormDefinition {
  let candidate = input
  if (typeof input === 'string') {
    try {
      candidate = JSON.parse(input) as unknown
    } catch {
      throw new ClinicalFormValidationError(['O JSON da definicao do formulario e invalido'])
    }
  }

  let serializedLength = 0
  try {
    serializedLength = JSON.stringify(candidate).length
  } catch {
    throw new ClinicalFormValidationError(['A definicao do formulario nao pode ser serializada'])
  }
  if (serializedLength > 2_000_000) {
    throw new ClinicalFormValidationError(['A definicao do formulario excede o limite de 2 MB'])
  }

  const result = schema.safeParse(sanitizeUnknown(candidate))
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    })
    throw new ClinicalFormValidationError(issues)
  }
  return result.data
}

export const validateFormDefinition = parseFormDefinition

export function buildRuntimeManifest(input: unknown): FormRuntimeManifest {
  const definition = parseFormDefinition(input)
  return {
    schemaVersion: definition.schemaVersion,
    specialtyCode: definition.specialtyCode,
    templateName: definition.name,
    defaultDocumentFormat: definition.defaultDocumentFormat,
    documents: definition.documents.map((document) => ({
      id: document.id,
      kind: document.kind,
      label: document.label,
      fields: document.tabs.flatMap((tab) =>
        tab.elements
          .filter((field) => field.type !== 'titulo' && field.type !== 'divisor')
          .map((field) => ({
            id: field.id,
            tabId: tab.id,
            label: field.label,
            type: field.type,
            semanticRole: field.semanticRole,
            required: field.required,
            validation: field.validation,
            relationships: field.relationships,
            ai: field.ai,
            options: field.options,
            columns: field.columns,
          }))
      ),
    })),
  }
}

export function stringifyFormDefinition(input: unknown): string {
  return JSON.stringify(parseFormDefinition(input))
}
