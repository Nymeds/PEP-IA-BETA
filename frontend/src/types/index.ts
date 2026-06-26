export interface Patient {
  id: string
  name: string
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
  status: string
  scheduledAt?: string
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
  patient?: Patient
  audioPath?: string
  transcript?: string
  transcriptStructured?: string
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
  status: string
  scheduledAt?: string
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
  systemsReview?: Record<string, string[]>
  currentSection?: string
}

export interface TranscribeResponse {
  chunkTranscript: string
  fullTranscript: string | null
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
