export interface Patient {
  id: string
  userId?: string
  name: string
  quickCreated?: boolean
  socialName?: string
  cpf?: string
  rg?: string
  birthDate?: string
  sex?: string
  maritalStatus?: string
  phone?: string
  whatsapp?: string
  email?: string
  cep?: string
  address?: string
  addressNumber?: string
  neighborhood?: string
  city?: string
  state?: string
  emergencyContact?: string
  emergencyPhone?: string
  bloodType?: string
  allergies?: string
  chronicDiseases?: string
  notes?: string
  createdAt: string
  updatedAt: string
  consultations?: ConsultationSummary[]
}

export interface ConsultationSummary {
  id: string
  patientId: string
  chiefComplaint?: string
  status: ConsultationStatus | string
  scheduledAt?: string
  startedAt?: string
  finishedAt?: string
  schedule?: Pick<ScheduleAgenda, 'id' | 'title' | 'specialty'> | null
  createdAt: string
}

export interface VitalSigns {
  pa?: string
  fc?: string
  fr?: string
  temp?: string
  spo2?: string
  glucose?: string
}

export interface PhysicalExam {
  headNeck?: string
  cardioRespiratory?: string
  abdomen?: string
  neurological?: string
  extremities?: string
}

export interface Medication {
  name: string
  dose: string
  frequency: string
  route: string
}

export interface AllergyDetail {
  substance: string
  reaction: string
}

export interface CidEntry {
  code: string
  description: string
}

export interface FamilyHistory {
  diabetes?: boolean
  hypertension?: boolean
  stroke?: boolean
  cancer?: boolean
  heartDisease?: boolean
}

export interface Consultation {
  id: string
  patientId: string
  scheduleId?: string | null
  schedule?: ScheduleAgenda | null
  patient?: Patient
  audioPath?: string
  transcript?: string
  transcriptStructured?: string
  specialtyData?: string
  aiState?: ConsultationAiState | null
  // Anamnese
  chiefComplaint?: string
  hda?: string
  symptomStart?: string
  symptomIntensity?: string
  symptoms?: string
  improvingFactors?: string
  worseningFactors?: string
  // Antecedentes
  previousDiseases?: string
  surgeries?: string
  hospitalizations?: string
  allergiesDetails?: string
  currentMedications?: string
  familyHistory?: string
  // Hábitos
  smoking?: string
  alcohol?: string
  physicalActivity?: string
  sleep?: string
  diet?: string
  drugs?: string
  occupation?: string
  // Revisão de sistemas
  systemsReview?: string
  // Exame físico
  vitalSigns?: string
  weight?: number
  height?: number
  bmi?: number
  generalState?: string
  physicalExam?: string
  // Diagnóstico
  mainHypothesis?: string
  differentials?: string
  confirmedDiagnosis?: string
  cid?: string
  // Conduta
  therapeuticPlan?: string
  orientations?: string
  referrals?: string
  followUpDate?: string
  // SOAP
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  status: ConsultationStatus | string
  scheduledAt?: string
  startedAt?: string
  finishedAt?: string
  createdAt: string
  updatedAt: string
}

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
  allergiesDetails?: AllergyDetail[]
  currentMedications?: Medication[]
  familyHistory?: FamilyHistory
  smoking?: string
  alcohol?: string
  physicalActivity?: string
  sleep?: string
  diet?: string
  occupation?: string
  vitalSigns?: VitalSigns
  weight?: number
  height?: number
  generalState?: string
  physicalExam?: PhysicalExam
  mainHypothesis?: string
  differentials?: string[]
  cid?: CidEntry[]
  therapeuticPlan?: string
  orientations?: string
  referrals?: string
  followUpDate?: string
  systemsReview?: Record<string, string[]>
  currentSection?: string
}

export type ClinicalTemplateId =
  | 'clinica_geral'
  | 'pediatria'
  | 'ginecologia_obstetricia'
  | 'psiquiatria'
  | 'cardiologia'

export type AiFieldStatus = 'suggested' | 'accepted' | 'manual' | 'dismissed' | 'review'

export interface EvidenceReference {
  segmentId: string
  sequence: number
  quote: string
}

export interface FieldProvenance {
  field: keyof ExtractedData
  status: AiFieldStatus
  source: 'patient' | 'clinician' | 'both' | 'unknown'
  speaker: 'Medico' | 'Paciente' | 'Indefinido'
  confidence: 'high' | 'medium' | 'low'
  requiresReview: boolean
  evidence: EvidenceReference[]
}

export interface ClinicalSuggestion {
  id: string
  category: 'clarification' | 'conflict' | 'clinical_attention' | 'documentation'
  title: string
  message: string
  field?: keyof ExtractedData
  proposedValue?: string
  evidence: EvidenceReference[]
  status: 'open' | 'accepted' | 'dismissed'
}

export interface SpecialtyDataItem {
  key: string
  value: string
  requiresReview: boolean
  evidence: EvidenceReference[]
}

export interface ConsultationAiState {
  id: string
  consultationId: string
  templateId: ClinicalTemplateId
  lastProcessedSequence: number
  processingThroughSequence?: number | null
  processingStartedAt?: string | null
  fieldMetaJson: string
  suggestionsJson: string
  promptVersion: string
  schemaVersion: string
  finalReviewAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface DeltaExtractionResult {
  extracted: ExtractedData
  suggestions: ClinicalSuggestion[]
  fieldMeta: Record<string, FieldProvenance>
  specialtyData?: SpecialtyDataItem[]
  processedThroughSequence?: number
  processing?: boolean
  templateId?: ClinicalTemplateId
  shadow?: boolean
}

export interface TranscribeResponse {
  chunkTranscript: string
  fullTranscript: string | null
}

export interface RealtimeClientSecretResponse {
  value: string
  expiresAt: number | null
}

export interface RealtimeTranscriptAppendResponse {
  appendedText: string
  fullTranscript: string | null
}

export interface ConsultationTranscriptSegment {
  id: string
  itemId: string
  sequence: number
  text: string
  source: string
  kind: string
  createdAt: string
}

export interface RawTranscriptResponse {
  rawTranscript: string
  currentTranscript: string | null
  hasEditedTranscript: boolean
  segmentCount: number
  segments: ConsultationTranscriptSegment[]
}

export interface DialogueTurn {
  speaker: 'Médico' | 'Paciente' | 'Indefinido'
  text: string
}

export interface SoapNote {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export interface FinalizeResponse {
  soap: SoapNote
  extracted: ExtractedData
  turns: DialogueTurn[]
  suggestions?: ClinicalSuggestion[]
  fieldMeta?: Record<string, FieldProvenance>
  templateId?: ClinicalTemplateId
}

export interface ConversationTopic {
  title: string
  summary: string
  excerpts: string[]
}

export interface ConsultationVersion {
  id: string
  consultationId: string
  version: number
  snapshot: string
  transcript?: string
  reason?: string
  editDiff?: string
  createdAt: string
}

export interface PatientSummary {
  overview: string
  activeProblems: string[]
  medications: string[]
  allergies: string[]
  recommendations: string
}

export interface AuthUser {
  id: string
  email: string
  name: string
  suggestedName: string
}

export type ConsultationStatus = 'em_espera' | 'em_consulta' | 'finalizado' | 'cancelado' | 'faltou'
export type ScheduleStatus = 'ativa' | 'inativa'

export interface ScheduleShift {
  id: string
  label: string
  enabled: boolean
  start: string
  end: string
  slots: number
}

export interface ScheduleAgenda {
  id: string
  title: string
  specialty: string
  status: ScheduleStatus
  activeWeekDays: number[]
  workOnHolidays: boolean
  appointmentDurationMinutes: number
  shifts: ScheduleShift[]
  enabledShiftCount: number
  maxAppointmentsPerDay: number
  createdAt: string
  updatedAt: string
}

export interface CalendarAppointment {
  id: string
  patientId: string
  patientName: string
  scheduledAt: string | null
  localDateTime: string | null
  status: ConsultationStatus | string
  chiefComplaint?: string | null
  scheduleId?: string | null
  scheduleTitle?: string | null
  scheduleSpecialty?: string | null
}

export interface DashboardStats {
  patientsCount: number
  consultationsCount: number
  waitingConsultationsCount: number
  inProgressConsultationsCount: number
  completedConsultationsCount: number
  todayAppointmentsCount: number
}

export interface ScheduleAgendaSummary extends ScheduleAgenda {
  appointmentsThisMonthCount: number
  todayAppointmentsCount: number
  nextAppointment: CalendarAppointment | null
}

export interface ScheduleDashboardResponse {
  month: string
  agendas: ScheduleAgendaSummary[]
  stats: DashboardStats
}

export interface ScheduleAgendasResponse {
  agendas: ScheduleAgenda[]
}

export interface ScheduleAgendaResponse {
  agenda: ScheduleAgenda
}

export interface ScheduleAgendaCalendarResponse {
  month: string
  agenda: ScheduleAgenda
  appointments: CalendarAppointment[]
  stats: {
    scheduledThisMonthCount: number
    waitingConsultationsCount: number
    completedConsultationsCount: number
    todayAppointmentsCount: number
  }
}

export interface ScheduleSlot {
  shiftId: string
  shiftLabel: string
  label: string
  localDateTime: string
  isoDateTime: string
  available: boolean
  appointment: CalendarAppointment | null
}

export interface ScheduleAgendaSlotsResponse {
  date: string
  allowed: boolean
  reason: string | null
  isHoliday: boolean
  agenda: ScheduleAgenda
  enabledShiftCount: number
  maxAppointmentsPerDay: number
  occupiedCount: number
  slots: ScheduleSlot[]
  appointments: CalendarAppointment[]
}

export type ScheduleSettings = Pick<
    ScheduleAgenda,
    'activeWeekDays' | 'workOnHolidays' | 'appointmentDurationMinutes' | 'shifts'
  >

export interface ScheduleCalendarResponse {
  month: string
  settings: ScheduleAgenda
  enabledShiftCount: number
  appointments: CalendarAppointment[]
  stats: {
    patientsCount: number
    consultationsCount: number
    todayAppointmentsCount: number
    completedConsultationsCount: number
    scheduledThisMonthCount: number
  }
}

export interface ScheduleSettingsResponse {
  settings: ScheduleAgenda
  enabledShiftCount: number
  maxAppointmentsPerDay: number
}

export interface ScheduleSlotsResponse extends ScheduleAgendaSlotsResponse {
  settings: ScheduleAgenda
}

export type TabId =
  | 'anamnese'
  | 'antecedentes'
  | 'habitos'
  | 'revisao_sistemas'
  | 'exame_fisico'
  | 'diagnostico'
  | 'conduta'
  | 'soap'

export type TabStatus = 'idle' | 'writing' | 'incomplete' | 'complete'

export interface TabInfo {
  id: TabId
  label: string
  shortLabel: string
  status: TabStatus
}

export type MedicalToolId =
  | 'patient_summary'
  | 'clinical_alerts'
  | 'ai_status'
  | 'readiness'
  | 'conversation_topics'
  | 'conversation_review'
  | 'soap_actions'

export interface MedicalToolAction {
  id: MedicalToolId
  label: string
  description: string
  enabled: boolean
}

export interface ConsultationReadinessItem {
  id: string
  label: string
  tabId: TabId
  complete: boolean
  detail: string
}

export type AiWorkflowStatus = 'idle' | 'recording' | 'processing' | 'interpreting' | 'generating_soap' | 'error'

export type UiDensity = 'compact' | 'comfortable'
export type PanelVisibility = 'expanded' | 'collapsed' | 'drawer'
export type FieldReviewState = 'empty' | 'ai_writing' | 'suggested' | 'review' | 'accepted' | 'manual'

export interface AsyncFeedbackState {
  status: 'idle' | 'loading' | 'success' | 'error'
  message?: string
  retryable?: boolean
  requestId?: string
}

export interface ConsultationWorkspaceState {
  density: UiDensity
  navigation: PanelVisibility
  medicalTools: PanelVisibility
  activeTab: TabId
}

export type AppointmentOperation = 'reschedule' | 'cancel' | 'no_show'

export interface AppointmentEvent {
  id: string
  consultationId: string
  operation: AppointmentOperation | 'book'
  previousScheduledAt?: string | null
  scheduledAt?: string | null
  previousStatus?: string | null
  status: string
  reason?: string | null
  createdAt: string
}

export interface PatientListResponse {
  items: Patient[]
  nextCursor: string | null
  total: number
}
