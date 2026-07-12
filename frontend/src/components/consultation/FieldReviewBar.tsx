import { CheckCircle2, Circle, Loader2, PenLine, Sparkles, AlertTriangle } from 'lucide-react'
import { FieldProvenance, TabId, TabStatus } from '@/types'
import { cn } from '../shared/utils'

const TAB_FIELDS: Record<TabId, string[]> = {
  anamnese: ['chiefComplaint', 'hda', 'symptomStart', 'symptomIntensity', 'symptoms', 'improvingFactors', 'worseningFactors'],
  antecedentes: ['previousDiseases', 'surgeries', 'hospitalizations', 'allergiesDetails', 'currentMedications', 'familyHistory'],
  habitos: ['smoking', 'alcohol', 'physicalActivity', 'sleep', 'diet', 'occupation'],
  revisao_sistemas: ['systemsReview'],
  exame_fisico: ['vitalSigns', 'weight', 'height', 'generalState', 'physicalExam'],
  diagnostico: ['mainHypothesis', 'differentials', 'confirmedDiagnosis', 'cid'],
  conduta: ['therapeuticPlan', 'orientations', 'referrals', 'followUpDate'],
  soap: ['subjective', 'objective', 'assessment', 'plan'],
}

const LABELS: Record<string, string> = {
  chiefComplaint: 'Queixa', hda: 'HDA', symptomStart: 'Início', symptomIntensity: 'Intensidade', symptoms: 'Sintomas',
  improvingFactors: 'Melhora', worseningFactors: 'Piora', previousDiseases: 'Doenças prévias', surgeries: 'Cirurgias',
  hospitalizations: 'Internações', allergiesDetails: 'Alergias', currentMedications: 'Medicamentos', familyHistory: 'História familiar',
  smoking: 'Tabagismo', alcohol: 'Álcool', physicalActivity: 'Atividade', sleep: 'Sono', diet: 'Dieta', occupation: 'Ocupação',
  systemsReview: 'Revisão de sistemas', vitalSigns: 'Sinais vitais', weight: 'Peso', height: 'Altura', generalState: 'Estado geral',
  physicalExam: 'Exame físico', mainHypothesis: 'Hipótese', differentials: 'Diferenciais', confirmedDiagnosis: 'Diagnóstico', cid: 'CID',
  therapeuticPlan: 'Plano', orientations: 'Orientações', referrals: 'Encaminhamento', followUpDate: 'Retorno',
  subjective: 'Subjetivo', objective: 'Objetivo', assessment: 'Avaliação', plan: 'Plano SOAP',
}

const STATUS = {
  suggested: { label: 'Sugestão IA', icon: Sparkles, cls: 'bg-blue-50 text-blue-700' },
  review: { label: 'Revisar', icon: AlertTriangle, cls: 'bg-amber-50 text-amber-700' },
  accepted: { label: 'Aceito', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
  manual: { label: 'Manual', icon: PenLine, cls: 'bg-slate-100 text-slate-700' },
  dismissed: { label: 'Descartado', icon: Circle, cls: 'bg-slate-50 text-slate-500' },
} as const

export function FieldReviewBar({ activeTab, fieldMeta, tabStatus }: {
  activeTab: TabId
  fieldMeta: Record<string, FieldProvenance>
  tabStatus: TabStatus
}) {
  const items = TAB_FIELDS[activeTab].flatMap((field) => fieldMeta[field] ? [{ field, meta: fieldMeta[field] }] : [])
  if (!items.length && tabStatus !== 'writing') return null

  return (
    <div className="mb-3 flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2" aria-label="Estado dos campos desta seção">
      {tabStatus === 'writing' ? <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> IA preenchendo</span> : null}
      {items.map(({ field, meta }) => {
        const status = STATUS[meta.status]
        const Icon = status.icon
        return <span key={field} className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium', status.cls)} title={meta.evidence[0]?.quote || status.label}><Icon className="h-3 w-3" />{LABELS[field] || field}: {status.label}</span>
      })}
    </div>
  )
}
