import {
  Activity,
  Brain,
  BrainCircuit,
  ClipboardList,
  FileCheck2,
  FileText,
  Files,
  FolderLock,
  HeartHandshake,
  HeartPulse,
  Hospital,
  LayoutGrid,
  LockKeyhole,
  NotebookPen,
  Pill,
  Route,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Stethoscope,
  Syringe,
  Target,
  Thermometer,
  TrendingUp,
  Users,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'

export type FormFieldIconCategory =
  | 'clinico'
  | 'documento'
  | 'pessoas'
  | 'planejamento'
  | 'seguranca'
  | 'geral'

export interface FormFieldIconDefinition {
  label: string
  category: FormFieldIconCategory
  keywords: readonly string[]
  icon: LucideIcon
}

export const FORM_FIELD_ICON_CATEGORY_LABELS: Record<FormFieldIconCategory, string> = {
  clinico: 'Clínico',
  documento: 'Documentos',
  pessoas: 'Pessoas',
  planejamento: 'Planejamento',
  seguranca: 'Segurança',
  geral: 'Geral',
}

export const FORM_FIELD_ICON_CATALOG = {
  Stethoscope: {
    label: 'Estetoscópio',
    category: 'clinico',
    keywords: ['consulta', 'exame', 'médico'],
    icon: Stethoscope,
  },
  HeartPulse: {
    label: 'Saúde cardiovascular',
    category: 'clinico',
    keywords: ['coração', 'pulso', 'cardiologia', 'sinais vitais'],
    icon: HeartPulse,
  },
  Activity: {
    label: 'Atividade clínica',
    category: 'clinico',
    keywords: ['monitoramento', 'sinais vitais', 'eletrocardiograma'],
    icon: Activity,
  },
  Thermometer: {
    label: 'Temperatura',
    category: 'clinico',
    keywords: ['febre', 'termômetro', 'sinais vitais'],
    icon: Thermometer,
  },
  Pill: {
    label: 'Medicamentos',
    category: 'clinico',
    keywords: ['remédio', 'prescrição', 'tratamento'],
    icon: Pill,
  },
  Syringe: {
    label: 'Vacinas e injetáveis',
    category: 'clinico',
    keywords: ['vacina', 'injeção', 'imunização'],
    icon: Syringe,
  },
  Hospital: {
    label: 'Unidade de saúde',
    category: 'clinico',
    keywords: ['hospital', 'clínica', 'internação'],
    icon: Hospital,
  },
  Brain: {
    label: 'Saúde mental',
    category: 'clinico',
    keywords: ['psicologia', 'neurologia', 'cognição'],
    icon: Brain,
  },
  BrainCircuit: {
    label: 'Formulação clínica',
    category: 'clinico',
    keywords: ['análise', 'raciocínio', 'inteligência artificial'],
    icon: BrainCircuit,
  },
  ClipboardList: {
    label: 'Prontuário',
    category: 'documento',
    keywords: ['ficha', 'registro', 'lista'],
    icon: ClipboardList,
  },
  NotebookPen: {
    label: 'Anotações',
    category: 'documento',
    keywords: ['nota', 'escrita', 'observação'],
    icon: NotebookPen,
  },
  FileText: {
    label: 'Documento',
    category: 'documento',
    keywords: ['arquivo', 'texto', 'relatório'],
    icon: FileText,
  },
  FileCheck2: {
    label: 'Documento validado',
    category: 'documento',
    keywords: ['emitido', 'concluído', 'laudo'],
    icon: FileCheck2,
  },
  Files: {
    label: 'Materiais',
    category: 'documento',
    keywords: ['arquivos', 'anexos', 'documentos'],
    icon: Files,
  },
  ScanSearch: {
    label: 'Observações',
    category: 'documento',
    keywords: ['buscar', 'examinar', 'revisar'],
    icon: ScanSearch,
  },
  Users: {
    label: 'Participantes',
    category: 'pessoas',
    keywords: ['familiares', 'equipe', 'grupo'],
    icon: Users,
  },
  HeartHandshake: {
    label: 'Acolhimento',
    category: 'pessoas',
    keywords: ['cuidado', 'vínculo', 'apoio'],
    icon: HeartHandshake,
  },
  Target: {
    label: 'Objetivos',
    category: 'planejamento',
    keywords: ['meta', 'foco', 'resultado'],
    icon: Target,
  },
  Route: {
    label: 'Plano terapêutico',
    category: 'planejamento',
    keywords: ['rota', 'conduta', 'encaminhamento'],
    icon: Route,
  },
  TrendingUp: {
    label: 'Evolução',
    category: 'planejamento',
    keywords: ['progresso', 'melhora', 'acompanhamento'],
    icon: TrendingUp,
  },
  ShieldCheck: {
    label: 'Consentimentos',
    category: 'seguranca',
    keywords: ['proteção', 'autorização', 'privacidade'],
    icon: ShieldCheck,
  },
  ShieldAlert: {
    label: 'Risco',
    category: 'seguranca',
    keywords: ['atenção', 'perigo', 'proteção'],
    icon: ShieldAlert,
  },
  Siren: {
    label: 'Alerta',
    category: 'seguranca',
    keywords: ['urgência', 'emergência', 'aviso'],
    icon: Siren,
  },
  LockKeyhole: {
    label: 'Restrito',
    category: 'seguranca',
    keywords: ['sigilo', 'privado', 'bloqueado'],
    icon: LockKeyhole,
  },
  FolderLock: {
    label: 'Pasta restrita',
    category: 'seguranca',
    keywords: ['sigilo', 'arquivo', 'privado'],
    icon: FolderLock,
  },
  LayoutGrid: {
    label: 'Geral',
    category: 'geral',
    keywords: ['grade', 'seção', 'outros'],
    icon: LayoutGrid,
  },
} as const satisfies Record<string, FormFieldIconDefinition>

export type FormFieldIconName = keyof typeof FORM_FIELD_ICON_CATALOG

export interface FormFieldIconOption {
  value: FormFieldIconName
  label: string
  category: FormFieldIconCategory
  categoryLabel: string
  keywords: readonly string[]
}

export const DEFAULT_FORM_FIELD_ICON: FormFieldIconName = 'LayoutGrid'

export const FORM_FIELD_ICON_OPTIONS: readonly FormFieldIconOption[] = (
  Object.entries(FORM_FIELD_ICON_CATALOG) as [FormFieldIconName, FormFieldIconDefinition][]
).map(([value, definition]) => ({
  value,
  label: definition.label,
  category: definition.category,
  categoryLabel: FORM_FIELD_ICON_CATEGORY_LABELS[definition.category],
  keywords: definition.keywords,
}))

export function isFormFieldIconName(value: unknown): value is FormFieldIconName {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(FORM_FIELD_ICON_CATALOG, value)
}

export function resolveFormFieldIconName(
  value: unknown,
  fallback: FormFieldIconName = DEFAULT_FORM_FIELD_ICON,
): FormFieldIconName {
  return isFormFieldIconName(value) ? value : fallback
}

export function getFormFieldIconDefinition(
  value: unknown,
  fallback: FormFieldIconName = DEFAULT_FORM_FIELD_ICON,
): FormFieldIconDefinition & { name: FormFieldIconName } {
  const name = resolveFormFieldIconName(value, fallback)
  return { name, ...FORM_FIELD_ICON_CATALOG[name] }
}

function normalizeSearchTerm(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

export function getFormFieldIconOptions(searchTerm = ''): readonly FormFieldIconOption[] {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm)
  if (!normalizedSearchTerm) return FORM_FIELD_ICON_OPTIONS

  return FORM_FIELD_ICON_OPTIONS.filter((option) => {
    const searchableContent = [
      option.value,
      option.label,
      option.categoryLabel,
      ...option.keywords,
    ].join(' ')

    return normalizeSearchTerm(searchableContent).includes(normalizedSearchTerm)
  })
}

export interface FormFieldIconProps extends Omit<LucideProps, 'children' | 'name'> {
  name?: string | null
  fallback?: FormFieldIconName
}

export function FormFieldIcon({
  name,
  fallback = DEFAULT_FORM_FIELD_ICON,
  focusable,
  ...props
}: FormFieldIconProps) {
  const definition = getFormFieldIconDefinition(name, fallback)
  const Icon = definition.icon

  return <Icon focusable={focusable ?? 'false'} {...props} />
}
