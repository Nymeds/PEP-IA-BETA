export const FORM_SCHEMA_VERSION = 'clinical-form-v1' as const

export type FormTemplateStatus = 'rascunho' | 'publicado' | 'arquivado'
export type FormTemplateOrigin = 'preset_sistema' | 'usuario' | 'copia'
export type ClinicalDocumentKind = 'compartilhavel' | 'restrito'
export type ClinicalDocumentFormat = 'SOAP' | 'DAP' | 'BIRP'

export type FormElementType =
  | 'texto_curto'
  | 'texto_longo'
  | 'checkbox'
  | 'selecao_unica'
  | 'selecao_multipla'
  | 'numero'
  | 'data'
  | 'titulo'
  | 'divisor'
  | 'grupo_repetivel'

export type FormAiMode = 'sem_acesso' | 'preencher' | 'resumir' | 'sugerir_revisao'

export type FormColorToken =
  | 'azul'
  | 'verde'
  | 'amarelo'
  | 'vermelho'
  | 'roxo'
  | 'cinza'
  | 'turquesa'
  | 'rosa'

export interface FormElementLayout {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  mobileOrder: number
}

export interface FormAiPolicy {
  mode: FormAiMode
  description?: string
  allowedEvidence?: string[]
  prohibitedInferences?: string[]
  expectedFormat?: string
  examples?: string[]
  counterexamples?: string[]
}

export interface ClinicalFormOption {
  id: string
  label: string
}

export interface RepeaterColumnDefinition {
  id: string
  label: string
  type: Exclude<FormElementType, 'titulo' | 'divisor' | 'grupo_repetivel'>
  required: boolean
  options?: ClinicalFormOption[]
  ai: FormAiPolicy
}

export interface ClinicalFormElement {
  id: string
  type: FormElementType
  label: string
  helpText?: string
  color: FormColorToken
  required: boolean
  semanticRole?: string
  validation?: {
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
  }
  relationships?: Array<{
    fieldId: string
    kind: 'depende_de' | 'correlaciona_com' | 'exclusivo_com' | 'deriva_de'
    description?: string
  }>
  layout: FormElementLayout
  options?: ClinicalFormOption[]
  ai: FormAiPolicy
  columns?: RepeaterColumnDefinition[]
}

export interface ClinicalFormTab {
  id: string
  label: string
  icon: string
  color: FormColorToken
  elements: ClinicalFormElement[]
}

export interface ClinicalFormDocument {
  id: string
  kind: ClinicalDocumentKind
  label: string
  icon: string
  color: FormColorToken
  tabs: ClinicalFormTab[]
}

export interface ClinicalFormDefinition {
  schemaVersion: typeof FORM_SCHEMA_VERSION
  name: string
  specialtyCode: string
  defaultDocumentFormat: ClinicalDocumentFormat
  documents: ClinicalFormDocument[]
}

export interface ClinicalFormVersionSummary {
  id: string
  version: number
  publishedAt: string
  checksum?: string
}

export interface ClinicalFormVersion extends ClinicalFormVersionSummary {
  definition: ClinicalFormDefinition
  createdAt?: string
}

export interface ClinicalFormTemplate {
  id: string
  name: string
  specialtyCode: string
  status: FormTemplateStatus
  origin: FormTemplateOrigin
  isDefault: boolean
  draftDefinition: ClinicalFormDefinition
  latestVersion?: ClinicalFormVersionSummary | null
  versionCount?: number
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface FormTemplateListResponse {
  items: ClinicalFormTemplate[]
}

export interface FormTemplateResponse {
  template: ClinicalFormTemplate
}

export interface FormVersionListResponse {
  items: ClinicalFormVersion[]
}

export interface CreateFormTemplateInput {
  name: string
  specialtyCode: string
  definition?: ClinicalFormDefinition
}

export interface UpdateFormTemplateInput {
  name?: string
  draftDefinition?: ClinicalFormDefinition
  expectedUpdatedAt?: string
}

export interface FormValidationIssue {
  path: string
  message: string
}

export interface DynamicEvidence {
  segmentId: string
  sequence: number
  quote: string
  speakerLabel: string | null
  participantId?: string | null
  startMs: number | null
  endMs: number | null
}

export interface DynamicFieldValue {
  value: unknown
  source: 'manual' | 'ia' | string
  reviewStatus: 'provisorio' | 'nao_revisado' | 'revisao_obrigatoria' | 'confirmado' | string
  evidence: DynamicEvidence[]
  revision: number
  updatedAt: string
  confidence: 'low' | 'medium' | 'high' | null
  uncertainty: string | null
  history: Array<{
    id: string
    operation: string
    actorType: string
    actorUserId: string | null
    previousValue: unknown
    nextValue: unknown
    metadata: unknown
    createdAt: string
  }>
}

export interface DynamicConsultationDocument {
  id: string
  kind: ClinicalDocumentKind
  title: string
  status: string
  revision: number
  values: Record<string, DynamicFieldValue>
}

export interface DynamicParticipant {
  id: string
  consultationId: string
  name: string
  role: string
  speakerLabel: string | null
  authorized: boolean
  authorizedAt: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export type DynamicConsentType = 'gravacao_audio' | 'transcricao_ia' | 'participacao'

export interface DynamicConsent {
  id: string
  consultationId: string
  participantId: string | null
  type: DynamicConsentType
  granted: boolean
  termsVersion: string
  evidenceJson: string | null
  recordedAt: string
  revokedAt: string | null
}

export interface DynamicQuarantineItem {
  id: string
  consultationId: string
  kind: string
  reason: string
  status: 'pendente' | 'restaurado' | 'descartado' | string
  sourceText: string | null
  payloadJson: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface DynamicGeneratedSection {
  key: string
  title: string
  content: string
  evidenceSegmentIds: string[]
  evidence?: DynamicEvidence[]
}

export interface DynamicGeneratedContent {
  format: ClinicalDocumentFormat
  documentKind: ClinicalDocumentKind
  sections: DynamicGeneratedSection[]
  warnings: string[]
  requiresProfessionalReview: true
}

export interface DynamicGeneratedDocument {
  id: string
  consultationId: string
  format: ClinicalDocumentFormat
  documentKind: ClinicalDocumentKind
  status: 'rascunho' | 'confirmado' | string
  contentJson: string
  sourceSnapshot: string | null
  parentDocumentId?: string | null
  amendmentReason?: string | null
  reviewedAt: string | null
  reviewedBy?: string | null
  createdAt: string
  updatedAt: string
  requiresProfessionalReview?: boolean
}

export interface DynamicDialogueTurn {
  speaker: 'Medico' | 'Paciente' | 'Terceiro' | 'Indefinido'
  text: string
  start?: number
  end?: number
  diarizationLabel?: string
}

export interface DynamicTranscriptSegment {
  id: string
  sequence: number
  text: string
  speakerLabel?: string | null
  participantId?: string | null
  participantRole?: string | null
  participantAuthorized?: boolean
  startMs?: number | null
  endMs?: number | null
}

export interface DynamicFormTemplateRuntime {
  id: string
  name: string
  versionId: string
  version: number
  checksum: string
  defaultDocumentFormat: ClinicalDocumentFormat
  latestVersionId: string | null
  latestVersion: number | null
  newVersionAvailable: boolean
}

export interface DynamicConsultationRuntime {
  formMode: 'dynamic'
  consultationId: string
  specialtyCode: string | null
  template: DynamicFormTemplateRuntime
  definition: ClinicalFormDefinition
  manifest: unknown
  documents: DynamicConsultationDocument[]
  participants: DynamicParticipant[]
  consents: DynamicConsent[]
  quarantine: DynamicQuarantineItem[]
  generatedDocuments: DynamicGeneratedDocument[]
  medicationReferences: DynamicMedicationReference[]
  conversation: {
    transcript: string | null
    turns: DynamicDialogueTurn[]
    segments: DynamicTranscriptSegment[]
  }
  canChangeForm: boolean
  suppressFormChangeWarning: boolean
}

export interface LegacyConsultationRuntime {
  formMode: 'legacy'
  consultationId: string
}

export type ConsultationRuntimeResponse = DynamicConsultationRuntime | LegacyConsultationRuntime

export interface DynamicFieldUpdateResult {
  updates: Array<{
    fieldId: string
    documentKind: ClinicalDocumentKind
    value: unknown
    source: 'ia'
    reviewStatus: string
    confidence: 'low' | 'medium' | 'high'
    uncertainty: string | null
    evidence: DynamicEvidence[]
    aiMode: Exclude<FormAiMode, 'sem_acesso'>
  }>
  quarantine: Array<{
    kind: string
    reason: string
    sourceText: string | null
    segmentId: string | null
  }>
  riskAlerts: Array<{
    kind: string
    severity: 'low' | 'medium' | 'high'
    summary: string
    evidence: DynamicEvidence[]
  }>
  processing: boolean
}

export interface DynamicDiarizationResult {
  turns: DynamicDialogueTurn[]
  unknownLabels: string[]
  requiresConfirmation: boolean
}

export interface DynamicFormVersionPreview {
  preview: true
  current: { id: string; version: number; name: string } | null
  next: { id: string; version: number; name: string }
  orphanedFieldIds: string[]
  addedFieldIds: string[]
  incompatibleFields: Array<{
    fieldId: string
    reason: string
    previous: { documentKind: ClinicalDocumentKind; type: FormElementType }
    next: { documentKind: ClinicalDocumentKind; type: FormElementType } | null
  }>
  manualValuesPreserved: true
  confirmationSuppressed: boolean
}

export interface DynamicFormVersionChangeResult {
  changed: boolean
  versionId: string
  version: number
  orphanedFieldIds: string[]
  addedFieldIds: string[]
  message: string
}

export interface DynamicConversationTopic {
  title: string
  summary: string
  evidence: DynamicEvidence[]
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
  recordId?: string
  status?: DynamicMedicationReferenceStatus
}

export type DynamicMedicationReferenceStatus =
  | 'pendente'
  | 'aceito'
  | 'descartado'
  | 'sem_fonte_oficial'
  | string

export interface DynamicMedicationReference {
  id: string
  consultationId: string
  searchedName: string
  normalizedName: string | null
  sourceTitle: string | null
  sourceUrl: string | null
  status: DynamicMedicationReferenceStatus
  consultedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  createdAt: string
  content: MedicationReference
}
