'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Brain,
  BrainCircuit,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardList,
  CopyPlus,
  Eye,
  FileText,
  FileCheck2,
  Files,
  FolderLock,
  GripVertical,
  Hash,
  Heading,
  HeartHandshake,
  LayoutGrid,
  List,
  ListChecks,
  LockKeyhole,
  Maximize2,
  Minus,
  Monitor,
  MonitorSmartphone,
  Move,
  NotebookPen,
  PanelRight,
  Pill,
  Plus,
  Redo2,
  Route,
  Rocket,
  Rows3,
  Save,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Smartphone,
  TextCursorInput,
  Target,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorState, LoadingState } from '@/components/ui/AsyncState'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { cn } from '@/components/shared/utils'
import {
  FORM_CANVAS_WIDTH,
  FORM_GRID_SIZE,
  FORM_LAYOUT_GAP,
  layoutsOverlap,
  resolveDynamicCanvasLayout,
} from '@/lib/form-layout'
import { FormsApiError, formsApi } from '@/services/forms-api'
import {
  FORM_SCHEMA_VERSION,
  type ClinicalDocumentFormat,
  type ClinicalFormDefinition,
  type ClinicalFormDocument,
  type ClinicalFormElement,
  type ClinicalFormTab,
  type FormAiMode,
  type FormColorToken,
  type FormElementLayout,
  type FormElementType,
  type FormValidationIssue,
  type RepeaterColumnDefinition,
} from '@/types/forms'

const CANVAS_WIDTH = FORM_CANVAS_WIDTH
const CANVAS_MIN_HEIGHT = 720
const GRID_SIZE = FORM_GRID_SIZE
const MIN_FIELD_WIDTH = 160
const MIN_FIELD_HEIGHT = 56

const FIELD_TYPES: { type: FormElementType; label: string; description: string; icon: LucideIcon }[] = [
  { type: 'texto_curto', label: 'Texto curto', description: 'Uma linha de texto', icon: TextCursorInput },
  { type: 'texto_longo', label: 'Texto longo', description: 'Anotações em várias linhas', icon: Type },
  { type: 'checkbox', label: 'Checkbox', description: 'Resposta sim ou não', icon: CheckSquare },
  { type: 'selecao_unica', label: 'Seleção única', description: 'Escolha uma opção', icon: List },
  { type: 'selecao_multipla', label: 'Seleção múltipla', description: 'Escolha várias opções', icon: ListChecks },
  { type: 'numero', label: 'Número', description: 'Valor numérico', icon: Hash },
  { type: 'data', label: 'Data', description: 'Data do registro', icon: CalendarDays },
  { type: 'titulo', label: 'Título', description: 'Cabeçalho visual', icon: Heading },
  { type: 'divisor', label: 'Divisor', description: 'Separador de conteúdo', icon: Minus },
  { type: 'grupo_repetivel', label: 'Grupo repetível', description: 'Lista de familiares ou medicamentos', icon: Rows3 },
]

const AI_MODES: { value: FormAiMode; label: string; description: string }[] = [
  { value: 'sem_acesso', label: 'Sem acesso', description: 'A IA não lê nem altera este campo.' },
  { value: 'preencher', label: 'Preencher', description: 'Preenche fatos com evidência validada.' },
  { value: 'resumir', label: 'Resumir', description: 'Condensa evidências sem criar conclusões.' },
  { value: 'sugerir_revisao', label: 'Sugerir para revisão', description: 'Nunca confirma sem ação do profissional.' },
]

const COLORS: { value: FormColorToken; label: string; swatch: string }[] = [
  { value: 'cinza', label: 'Cinza', swatch: 'bg-slate-500' },
  { value: 'azul', label: 'Azul', swatch: 'bg-blue-500' },
  { value: 'turquesa', label: 'Turquesa', swatch: 'bg-cyan-500' },
  { value: 'verde', label: 'Verde', swatch: 'bg-emerald-500' },
  { value: 'amarelo', label: 'Amarelo', swatch: 'bg-amber-500' },
  { value: 'vermelho', label: 'Vermelho', swatch: 'bg-red-500' },
  { value: 'rosa', label: 'Rosa', swatch: 'bg-rose-500' },
  { value: 'roxo', label: 'Roxo', swatch: 'bg-violet-500' },
]

const ICONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'ClipboardList', label: 'Prontuário', icon: ClipboardList },
  { value: 'LockKeyhole', label: 'Restrito', icon: LockKeyhole },
  { value: 'FolderLock', label: 'Pasta restrita', icon: FolderLock },
  { value: 'ShieldCheck', label: 'Consentimentos', icon: ShieldCheck },
  { value: 'Target', label: 'Objetivos', icon: Target },
  { value: 'HeartHandshake', label: 'Acolhimento', icon: HeartHandshake },
  { value: 'Users', label: 'Familiares', icon: Users },
  { value: 'Pill', label: 'Medicamentos', icon: Pill },
  { value: 'TrendingUp', label: 'Evolução', icon: TrendingUp },
  { value: 'ShieldAlert', label: 'Risco', icon: ShieldAlert },
  { value: 'Route', label: 'Plano', icon: Route },
  { value: 'FileCheck2', label: 'Documentos emitidos', icon: FileCheck2 },
  { value: 'BrainCircuit', label: 'Formulação', icon: BrainCircuit },
  { value: 'Brain', label: 'Psicologia', icon: Brain },
  { value: 'ScanSearch', label: 'Observações', icon: ScanSearch },
  { value: 'Siren', label: 'Alerta', icon: Siren },
  { value: 'Files', label: 'Materiais', icon: Files },
  { value: 'NotebookPen', label: 'Anotações', icon: NotebookPen },
  { value: 'FileText', label: 'Documento', icon: FileText },
  { value: 'LayoutGrid', label: 'Geral', icon: LayoutGrid },
]

const SEMANTIC_ROLES = [
  { value: '', label: 'Sem papel regulatório' },
  { value: 'identificacao', label: 'Identificação' },
  { value: 'demanda_objetivos', label: 'Demanda e objetivos' },
  { value: 'evolucao_procedimentos', label: 'Evolução e procedimentos' },
  { value: 'encaminhamento_encerramento', label: 'Encaminhamento e encerramento' },
  { value: 'documentos_emitidos', label: 'Documentos emitidos' },
  { value: 'materiais_avaliacao_psicologica', label: 'Materiais de avaliação psicológica' },
  { value: 'enquadramento_consentimentos', label: 'Enquadramento e consentimentos' },
  { value: 'contexto_funcionamento', label: 'Contexto e funcionamento' },
  { value: 'formulacao_hipoteses', label: 'Formulação e hipóteses' },
  { value: 'observacoes_estado_mental', label: 'Observações e estado mental' },
  { value: 'avaliacao_risco_detalhada', label: 'Avaliação detalhada de risco' },
  { value: 'anotacoes_tecnicas', label: 'Anotações técnicas' },
  { value: 'risco_protecao', label: 'Risco e proteção' },
  { value: 'medicamentos', label: 'Medicamentos' },
  { value: 'familiares_rede', label: 'Família e rede' },
  { value: 'outros', label: 'Outros' },
]

const REVIEW_ONLY_ROLES = new Set([
  'risco_protecao',
  'avaliacao_risco_detalhada',
  'formulacao_hipoteses',
  'materiais_avaliacao_psicologica',
  'medicamentos',
])

const COLOR_ACCENT: Record<FormColorToken, string> = {
  cinza: 'border-slate-400 bg-slate-50 text-slate-700',
  azul: 'border-blue-400 bg-blue-50 text-blue-700',
  turquesa: 'border-cyan-400 bg-cyan-50 text-cyan-700',
  verde: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  amarelo: 'border-amber-400 bg-amber-50 text-amber-700',
  vermelho: 'border-red-400 bg-red-50 text-red-700',
  rosa: 'border-rose-400 bg-rose-50 text-rose-700',
  roxo: 'border-violet-400 bg-violet-50 text-violet-700',
}

interface EditorHistory {
  past: ClinicalFormDefinition[]
  present: ClinicalFormDefinition | null
  future: ClinicalFormDefinition[]
}

interface PointerInteraction {
  elementId: string
  kind: 'move' | 'resize'
  startX: number
  startY: number
  startLayout: FormElementLayout
  originDefinition: ClinicalFormDefinition
}

function createId(prefix: string) {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${prefix}-${random}`
}

function snap(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function defaultDimensions(type: FormElementType) {
  if (type === 'texto_longo') return { width: 384, height: 128 }
  if (type === 'grupo_repetivel') return { width: 576, height: 240 }
  if (type === 'titulo') return { width: 384, height: 64 }
  if (type === 'divisor') return { width: 576, height: 56 }
  return { width: 288, height: 96 }
}

function fieldTypeLabel(type: FormElementType) {
  return FIELD_TYPES.find((item) => item.type === type)?.label || type
}

function makeElement(type: FormElementType, x: number, y: number, mobileOrder: number): ClinicalFormElement {
  const dimensions = defaultDimensions(type)
  const labels: Record<FormElementType, string> = {
    texto_curto: 'Novo campo de texto',
    texto_longo: 'Novo campo de anotações',
    checkbox: 'Nova confirmação',
    selecao_unica: 'Nova seleção',
    selecao_multipla: 'Nova seleção múltipla',
    numero: 'Novo valor',
    data: 'Nova data',
    titulo: 'Novo título',
    divisor: 'Nova seção',
    grupo_repetivel: 'Nova lista',
  }
  return {
    id: createId('campo'),
    type,
    label: labels[type],
    color: 'azul',
    required: false,
    semanticRole: type === 'titulo' || type === 'divisor' ? undefined : 'outros',
    layout: {
      x: snap(clamp(x, 0, CANVAS_WIDTH - dimensions.width)),
      y: snap(Math.max(0, y)),
      width: dimensions.width,
      height: dimensions.height,
      zIndex: 1,
      mobileOrder,
    },
    options: type === 'selecao_unica' || type === 'selecao_multipla'
      ? [{ id: createId('opcao'), label: 'Opção 1' }, { id: createId('opcao'), label: 'Opção 2' }]
      : undefined,
    columns: type === 'grupo_repetivel'
      ? [{ id: createId('coluna'), label: 'Item', type: 'texto_curto', required: false, ai: { mode: 'sem_acesso' } }]
      : undefined,
    ai: { mode: 'sem_acesso' },
  }
}

function getDocument(definition: ClinicalFormDefinition, documentId: string) {
  return definition.documents.find((document) => document.id === documentId)
}

function getTab(definition: ClinicalFormDefinition, documentId: string, tabId: string) {
  return getDocument(definition, documentId)?.tabs.find((tab) => tab.id === tabId)
}

function updateDocument(
  definition: ClinicalFormDefinition,
  documentId: string,
  updater: (document: ClinicalFormDocument) => ClinicalFormDocument
): ClinicalFormDefinition {
  return {
    ...definition,
    documents: definition.documents.map((document) => document.id === documentId ? updater(document) : document),
  }
}

function updateTab(
  definition: ClinicalFormDefinition,
  documentId: string,
  tabId: string,
  updater: (tab: ClinicalFormTab) => ClinicalFormTab
): ClinicalFormDefinition {
  return updateDocument(definition, documentId, (document) => ({
    ...document,
    tabs: document.tabs.map((tab) => tab.id === tabId ? updater(tab) : tab),
  }))
}

function updateElement(
  definition: ClinicalFormDefinition,
  documentId: string,
  tabId: string,
  elementId: string,
  updater: (element: ClinicalFormElement) => ClinicalFormElement
): ClinicalFormDefinition {
  return updateTab(definition, documentId, tabId, (tab) => ({
    ...tab,
    elements: tab.elements.map((element) => element.id === elementId ? updater(element) : element),
  }))
}

function overlaps(first: FormElementLayout, second: FormElementLayout) {
  return layoutsOverlap(first, second)
}

function hasCollision(elements: ClinicalFormElement[], candidate: ClinicalFormElement) {
  return elements.some((element) => element.id !== candidate.id && overlaps(element.layout, candidate.layout))
}

function findFreePosition(elements: ClinicalFormElement[], field: ClinicalFormElement) {
  let candidate = field
  let attempts = 0
  while (hasCollision(elements, candidate) && attempts < 300) {
    const collisions = elements.filter((element) => overlaps(element.layout, candidate.layout))
    const nextY = snap(Math.max(
      candidate.layout.y + GRID_SIZE,
      ...collisions.map((element) => element.layout.y + element.layout.height + FORM_LAYOUT_GAP)
    ))
    candidate = { ...candidate, layout: { ...candidate.layout, y: nextY } }
    attempts += 1
  }
  return candidate
}

function repairElementCollisions(elements: ClinicalFormElement[]) {
  const repaired = new Map<string, ClinicalFormElement>()
  const placed: ClinicalFormElement[] = []
  const ordered = [...elements].sort((left, right) =>
    left.layout.y - right.layout.y || left.layout.x - right.layout.x || left.layout.mobileOrder - right.layout.mobileOrder
  )

  ordered.forEach((element) => {
    const next = findFreePosition(placed, element)
    placed.push(next)
    repaired.set(next.id, next)
  })

  return elements.map((element) => repaired.get(element.id) || element)
}

function normalizeDefinition(definition: ClinicalFormDefinition): ClinicalFormDefinition {
  return {
    ...definition,
    schemaVersion: FORM_SCHEMA_VERSION,
    defaultDocumentFormat: definition.defaultDocumentFormat || 'SOAP',
    documents: definition.documents.map((document) => ({
      ...document,
      tabs: document.tabs.map((tab) => ({
        ...tab,
        elements: repairElementCollisions(tab.elements.map((element, index) => ({
          ...element,
          color: element.color || 'azul',
          required: Boolean(element.required),
          layout: {
            x: element.layout?.x ?? 0,
            y: element.layout?.y ?? index * 112,
            width: element.layout?.width ?? 288,
            height: element.layout?.height ?? 96,
            zIndex: element.layout?.zIndex ?? 1,
            mobileOrder: element.layout?.mobileOrder ?? index,
          },
          ai: element.ai || { mode: 'sem_acesso' },
        }))),
      })),
    })),
  }
}

function validateDefinition(definition: ClinicalFormDefinition): FormValidationIssue[] {
  const issues: FormValidationIssue[] = []
  const requiredRoles = [
    'identificacao',
    'demanda_objetivos',
    'evolucao_procedimentos',
    'encaminhamento_encerramento',
    'documentos_emitidos',
    'materiais_avaliacao_psicologica',
  ]
  const roles = new Map<string, { documentKind: string; path: string }>()

  if (definition.documents.length !== 2) {
    issues.push({ path: 'documents', message: 'O formulário precisa manter os documentos compartilhável e restrito.' })
  }

  definition.documents.forEach((document, documentIndex) => {
    if (!document.tabs.length) issues.push({ path: `documents.${documentIndex}.tabs`, message: `${document.label} precisa de pelo menos uma aba.` })
    document.tabs.forEach((tab, tabIndex) => {
      if (!tab.label.trim()) issues.push({ path: `documents.${documentIndex}.tabs.${tabIndex}.label`, message: 'Toda aba precisa de nome.' })
      tab.elements.forEach((element, elementIndex) => {
        const path = `${document.label} / ${tab.label} / ${element.label || `Campo ${elementIndex + 1}`}`
        if (!element.label.trim()) issues.push({ path, message: 'Todo elemento precisa de um rótulo.' })
        if (element.layout.x < 0 || element.layout.x + element.layout.width > CANVAS_WIDTH) {
          issues.push({ path, message: 'O campo precisa permanecer dentro da largura do canvas.' })
        }
        if (element.type !== 'titulo' && element.type !== 'divisor' && !element.semanticRole) {
          issues.push({ path, message: 'Declare o papel semântico deste campo clínico.' })
        }
        if ((REVIEW_ONLY_ROLES.has(element.semanticRole || '') || element.semanticRole === 'outros') &&
          element.ai.mode !== 'sem_acesso' && element.ai.mode !== 'sugerir_revisao') {
          issues.push({ path, message: 'Este papel permite apenas IA sem acesso ou sugestão para revisão.' })
        }
        if (element.ai.mode !== 'sem_acesso') {
          if (!element.ai.description?.trim()) issues.push({ path, message: 'Informe o significado clínico para permitir o uso pela IA.' })
          if (!element.ai.allowedEvidence?.length) issues.push({ path, message: 'Informe ao menos uma evidência permitida para a IA.' })
          if (!element.ai.prohibitedInferences?.length) issues.push({ path, message: 'Informe ao menos uma inferência proibida.' })
          if (!element.ai.expectedFormat?.trim()) issues.push({ path, message: 'Informe o formato esperado.' })
          if (!element.ai.examples?.length) issues.push({ path, message: 'Informe ao menos um exemplo válido.' })
          if (!element.ai.counterexamples?.length) issues.push({ path, message: 'Informe ao menos um contraexemplo.' })
        }
        if ((element.type === 'selecao_unica' || element.type === 'selecao_multipla') && (element.options?.filter((option) => option.label.trim()).length || 0) < 2) {
          issues.push({ path, message: 'Cadastre pelo menos duas opções.' })
        }
        if (element.type === 'grupo_repetivel' && !element.columns?.length) {
          issues.push({ path, message: 'O grupo repetível precisa de pelo menos uma coluna.' })
        }
        element.columns?.forEach((column) => {
          const columnPath = `${path} / coluna ${column.label}`
          if (!column.label.trim()) issues.push({ path: columnPath, message: 'Informe o nome da coluna.' })
          if ((column.type === 'selecao_unica' || column.type === 'selecao_multipla') && (column.options?.filter((option) => option.label.trim()).length || 0) < 2) {
            issues.push({ path: columnPath, message: 'Cadastre pelo menos duas opções.' })
          }
          if (column.ai.mode !== 'sem_acesso') {
            if (!column.ai.description?.trim()) issues.push({ path: columnPath, message: 'Informe o significado clínico para a IA.' })
            if (!column.ai.allowedEvidence?.length) issues.push({ path: columnPath, message: 'Informe evidências permitidas.' })
            if (!column.ai.prohibitedInferences?.length) issues.push({ path: columnPath, message: 'Informe inferências proibidas.' })
            if (!column.ai.expectedFormat?.trim()) issues.push({ path: columnPath, message: 'Informe o formato esperado.' })
            if (!column.ai.examples?.length) issues.push({ path: columnPath, message: 'Informe um exemplo.' })
            if (!column.ai.counterexamples?.length) issues.push({ path: columnPath, message: 'Informe um contraexemplo.' })
          }
        })
        if (element.semanticRole) roles.set(element.semanticRole, { documentKind: document.kind, path })
      })
      tab.elements.forEach((element, elementIndex) => {
        tab.elements.slice(elementIndex + 1).forEach((other) => {
          if (overlaps(element.layout, other.layout)) {
            issues.push({
              path: `${document.label} / ${tab.label}`,
              message: `“${element.label}” e “${other.label}” estão sobrepostos ou sem o espaçamento mínimo de ${FORM_LAYOUT_GAP} px.`,
            })
          }
        })
      })
    })
  })

  requiredRoles.forEach((role) => {
    if (!roles.has(role)) {
      const label = SEMANTIC_ROLES.find((item) => item.value === role)?.label || role
      issues.push({ path: 'Conteúdo documental mínimo', message: `Falta o papel regulatório “${label}”.` })
    }
  })
  const assessmentRole = roles.get('materiais_avaliacao_psicologica')
  if (assessmentRole && assessmentRole.documentKind !== 'restrito') {
    issues.push({ path: assessmentRole.path, message: 'Materiais de avaliação psicológica devem ficar no documento restrito.' })
  }
  return issues
}

function IconToken({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS.find((item) => item.value === name)?.icon || LayoutGrid
  return <Icon className={className} aria-hidden="true" />
}

function FieldPreview({ field, compact = false }: { field: ClinicalFormElement; compact?: boolean }) {
  if (field.type === 'titulo') {
    return <h3 className={cn('font-semibold text-slate-900', compact ? 'text-base' : 'text-lg')}>{field.label}</h3>
  }
  if (field.type === 'divisor') {
    return <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{field.label}</p><hr /></div>
  }

  return (
    <div className="h-full min-h-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="truncate text-xs font-medium text-slate-700">{field.label}</span>
        {field.required ? <span className="text-red-500" aria-label="Obrigatório">*</span> : null}
        {field.ai.mode !== 'sem_acesso' ? <Sparkles className="h-3 w-3 shrink-0 text-blue-600" aria-label="Campo assistido pela IA" /> : null}
      </div>
      {field.type === 'checkbox' ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400"><span className="h-4 w-4 rounded border border-slate-300" />Marcar opção</div>
      ) : field.type === 'texto_longo' ? (
        <div className="h-[calc(100%-24px)] min-h-14 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-300">Digite ou aguarde uma sugestão...</div>
      ) : field.type === 'selecao_unica' || field.type === 'selecao_multipla' ? (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400"><span>Selecionar...</span><ChevronDown className="h-3.5 w-3.5" /></div>
      ) : field.type === 'grupo_repetivel' ? (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-2 bg-slate-50 px-2 py-1.5 text-[10px] font-semibold text-slate-500">
            {(field.columns || []).slice(0, 2).map((column) => <span key={column.id} className="truncate">{column.label}</span>)}
          </div>
          <div className="p-3 text-center text-xs text-slate-400">Adicionar item</div>
        </div>
      ) : (
        <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-300">
          {field.type === 'data' ? 'dd/mm/aaaa' : field.type === 'numero' ? '0' : 'Digite aqui...'}
        </div>
      )}
    </div>
  )
}

function FieldPalette({ onAdd }: { onAdd: (type: FormElementType) => void }) {
  return (
    <aside className="rounded-xl border border-slate-200 bg-white" aria-label="Paleta de componentes">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Componentes</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Arraste para o canvas ou pressione Enter para inserir.</p>
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-1">
        {FIELD_TYPES.map(({ type, label, description, icon: Icon }) => (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy'
              event.dataTransfer.setData('application/x-pep-form-element', type)
            }}
            onClick={() => onAdd(type)}
            className="group flex min-h-14 cursor-grab items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-primary-300 hover:bg-primary-50 active:cursor-grabbing"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-primary-100 group-hover:text-primary-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-800">{label}</span>
              <span className="block truncate text-[11px] text-slate-500">{description}</span>
            </span>
            <GripVertical className="ml-auto h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
          </button>
        ))}
      </div>
    </aside>
  )
}

function ColorSelect({ value, onChange, id }: { value: FormColorToken; onChange: (value: FormColorToken) => void; id?: string }) {
  return (
    <div id={id} role="radiogroup" aria-label="Cor do elemento" className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
      {COLORS.map((color) => (
        <button
          key={color.value}
          type="button"
          role="radio"
          aria-checked={value === color.value}
          title={color.label}
          onClick={() => onChange(color.value)}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border bg-white transition-transform hover:scale-105',
            value === color.value ? 'border-slate-700 ring-2 ring-slate-300 ring-offset-1' : 'border-slate-200'
          )}
        >
          <span className={cn('h-4 w-4 rounded-full', color.swatch)} aria-hidden="true" />
          <span className="sr-only">{color.label}</span>
        </button>
      ))}
    </div>
  )
}

function IconSelect({ value, onChange, id }: { value: string; onChange: (value: string) => void; id?: string }) {
  return (
    <select id={id} className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
      {ICONS.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
    </select>
  )
}

function NumberControl({
  label,
  value,
  min,
  max,
  grid = true,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  grid?: boolean
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <input
        type="number"
        className="form-input"
        step={grid ? GRID_SIZE : 1}
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value) || 0
          onChange(grid ? snap(next) : Math.round(next))
        }}
      />
    </label>
  )
}

function RepeaterColumnsEditor({
  columns,
  onChange,
}: {
  columns: RepeaterColumnDefinition[]
  onChange: (columns: RepeaterColumnDefinition[]) => void
}) {
  const availableTypes = FIELD_TYPES.filter((item) => !['titulo', 'divisor', 'grupo_repetivel'].includes(item.type))
  const updateColumn = (columnId: string, updater: (column: RepeaterColumnDefinition) => RepeaterColumnDefinition) => {
    onChange(columns.map((item) => item.id === columnId ? updater(item) : item))
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="form-label mb-0">Colunas do grupo</span>
        <Button
          size="sm"
          onClick={() => onChange([...columns, { id: createId('coluna'), label: 'Nova coluna', type: 'texto_curto', required: false, ai: { mode: 'sem_acesso' } }])}
        >
          <Plus className="h-3.5 w-3.5" />Coluna
        </Button>
      </div>
      {columns.map((column, index) => (
        <div key={column.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="flex gap-2">
            <input
              className="form-input min-w-0 flex-1"
              value={column.label}
              aria-label={`Nome da coluna ${index + 1}`}
              onChange={(event) => onChange(columns.map((item) => item.id === column.id ? { ...item, label: event.target.value } : item))}
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Excluir coluna ${column.label}`}
              disabled={columns.length === 1}
              onClick={() => onChange(columns.filter((item) => item.id !== column.id))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <select
            className="form-input mt-2"
            value={column.type}
            aria-label={`Tipo da coluna ${column.label}`}
            onChange={(event) => onChange(columns.map((item) => {
              if (item.id !== column.id) return item
              const nextType = event.target.value as RepeaterColumnDefinition['type']
              const needsOptions = nextType === 'selecao_unica' || nextType === 'selecao_multipla'
              return {
                ...item,
                type: nextType,
                options: needsOptions
                  ? item.options?.length ? item.options : [{ id: createId('opcao'), label: 'Opção 1' }, { id: createId('opcao'), label: 'Opção 2' }]
                  : undefined,
              }
            }))}
          >
            {availableTypes.map((type) => <option key={type.type} value={type.type}>{type.label}</option>)}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={Boolean(column.required)}
              onChange={(event) => onChange(columns.map((item) => item.id === column.id ? { ...item, required: event.target.checked } : item))}
            />
            Obrigatória em cada item
          </label>
          {(column.type === 'selecao_unica' || column.type === 'selecao_multipla') ? (
            <label className="mt-2 block">
              <span className="form-label">Opções da coluna</span>
              <textarea
                className="form-textarea min-h-16"
                value={(column.options || []).map((option) => option.label).join('\n')}
                onChange={(event) => {
                  const labels = event.target.value.split('\n').map((label) => label.trim()).filter(Boolean)
                  updateColumn(column.id, (current) => ({
                    ...current,
                    options: labels.map((label, optionIndex) => ({ id: current.options?.[optionIndex]?.id || createId('opcao'), label })),
                  }))
                }}
              />
            </label>
          ) : null}
          <details className="mt-2 border-t border-slate-200 pt-2">
            <summary className="cursor-pointer text-xs font-semibold text-blue-700">Permissão da IA na coluna</summary>
            <div className="mt-2 space-y-2">
              <label>
                <span className="form-label">Modo</span>
                <select className="form-input" value={column.ai.mode} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, mode: event.target.value as FormAiMode } }))}>
                  {AI_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                </select>
              </label>
              {column.ai.mode !== 'sem_acesso' ? (
                <>
                  <label><span className="form-label">Significado clínico *</span><textarea className="form-textarea min-h-20" value={column.ai.description || ''} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, description: event.target.value } }))} /></label>
                  <label><span className="form-label">Evidências permitidas *</span><textarea className="form-textarea min-h-16" value={(column.ai.allowedEvidence || []).join('\n')} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, allowedEvidence: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } }))} /></label>
                  <label><span className="form-label">Inferências proibidas *</span><textarea className="form-textarea min-h-16" value={(column.ai.prohibitedInferences || []).join('\n')} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, prohibitedInferences: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } }))} /></label>
                  <label><span className="form-label">Formato esperado *</span><input className="form-input" value={column.ai.expectedFormat || ''} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, expectedFormat: event.target.value } }))} /></label>
                  <label><span className="form-label">Exemplos *</span><textarea className="form-textarea min-h-16" value={(column.ai.examples || []).join('\n')} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, examples: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } }))} /></label>
                  <label><span className="form-label">Contraexemplos *</span><textarea className="form-textarea min-h-16" value={(column.ai.counterexamples || []).join('\n')} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, ai: { ...current.ai, counterexamples: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } }))} /></label>
                </>
              ) : null}
            </div>
          </details>
        </div>
      ))}
    </div>
  )
}

function FormInspector({
  definition,
  document,
  tab,
  field,
  onDefinitionChange,
  onDocumentChange,
  onTabChange,
  onFieldChange,
  onDeleteField,
}: {
  definition: ClinicalFormDefinition
  document: ClinicalFormDocument
  tab: ClinicalFormTab
  field?: ClinicalFormElement
  onDefinitionChange: (definition: ClinicalFormDefinition) => void
  onDocumentChange: (document: ClinicalFormDocument) => void
  onTabChange: (tab: ClinicalFormTab) => void
  onFieldChange: (field: ClinicalFormElement) => void
  onDeleteField: () => void
}) {
  if (!field) {
    return (
      <aside className="rounded-xl border border-slate-200 bg-white" aria-label="Inspetor da aba">
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <PanelRight className="h-4 w-4 text-slate-500" />
          <div><h2 className="text-sm font-semibold text-slate-900">Propriedades da aba</h2><p className="text-[11px] text-slate-500">Selecione um campo para configurá-lo.</p></div>
        </div>
        <div className="space-y-5 p-4">
          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documento</legend>
            <label><span className="form-label">Nome</span><input className="form-input" value={document.label} maxLength={80} onChange={(event) => onDocumentChange({ ...document, label: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="form-label">Ícone</span><IconSelect value={document.icon} onChange={(icon) => onDocumentChange({ ...document, icon })} /></label>
              <label><span className="form-label">Cor</span><ColorSelect value={document.color} onChange={(color) => onDocumentChange({ ...document, color })} /></label>
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Aba atual</legend>
            <label><span className="form-label">Nome da aba</span><input className="form-input" value={tab.label} maxLength={80} onChange={(event) => onTabChange({ ...tab, label: event.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="form-label">Ícone</span><IconSelect value={tab.icon} onChange={(icon) => onTabChange({ ...tab, icon })} /></label>
              <label><span className="form-label">Cor</span><ColorSelect value={tab.color} onChange={(color) => onTabChange({ ...tab, color })} /></label>
            </div>
          </fieldset>
          <fieldset className="space-y-3 border-t border-slate-200 pt-4">
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Documento clínico</legend>
            <label>
              <span className="form-label">Formato padrão</span>
              <select
                className="form-input"
                value={definition.defaultDocumentFormat}
                onChange={(event) => onDefinitionChange({ ...definition, defaultDocumentFormat: event.target.value as ClinicalDocumentFormat })}
              >
                <option value="SOAP">SOAP — Subjetivo, Objetivo, Avaliação e Plano</option>
                <option value="DAP">DAP — Dados, Avaliação e Plano</option>
                <option value="BIRP">BIRP — Comportamento, Intervenção, Resposta e Plano</option>
              </select>
            </label>
          </fieldset>
        </div>
      </aside>
    )
  }

  const setLayout = (property: keyof FormElementLayout, value: number) => {
    const nextLayout = { ...field.layout, [property]: value }
    if (property === 'width') nextLayout.width = clamp(value, MIN_FIELD_WIDTH, CANVAS_WIDTH - field.layout.x)
    if (property === 'height') nextLayout.height = Math.max(MIN_FIELD_HEIGHT, value)
    if (property === 'x') nextLayout.x = clamp(value, 0, CANVAS_WIDTH - field.layout.width)
    if (property === 'y') nextLayout.y = Math.max(0, value)
    onFieldChange({ ...field, layout: nextLayout })
  }
  const aiModeLocked = field.type === 'titulo' || field.type === 'divisor'
  const aiModeReviewOnly = REVIEW_ONLY_ROLES.has(field.semanticRole || '') || field.semanticRole === 'outros'
  const relationshipTargets = document.tabs.flatMap((candidateTab) =>
    candidateTab.elements
      .filter((candidate) => candidate.id !== field.id && candidate.type !== 'titulo' && candidate.type !== 'divisor')
      .map((candidate) => ({ id: candidate.id, label: `${candidateTab.label} / ${candidate.label}` }))
  )

  return (
    <aside className="rounded-xl border border-slate-200 bg-white" aria-label={`Inspetor de ${field.label}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-900">Propriedades</h2><p className="truncate text-[11px] text-slate-500">{fieldTypeLabel(field.type)}</p></div>
        <Button size="icon" variant="ghost" aria-label="Excluir campo" onClick={onDeleteField}><Trash2 className="h-4 w-4 text-red-600" /></Button>
      </div>
      <div className="max-h-[calc(100dvh-230px)] space-y-5 overflow-y-auto p-4">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conteúdo</legend>
          <label><span className="form-label">Rótulo</span><input className="form-input" value={field.label} maxLength={160} onChange={(event) => onFieldChange({ ...field, label: event.target.value })} /></label>
          <label>
            <span className="form-label">Tipo</span>
            <select className="form-input" value={field.type} onChange={(event) => {
              const nextType = event.target.value as FormElementType
              const needsOptions = nextType === 'selecao_unica' || nextType === 'selecao_multipla'
              onFieldChange({
                ...field,
                type: nextType,
                ai: nextType === 'titulo' || nextType === 'divisor' ? { mode: 'sem_acesso' } : field.ai,
                options: needsOptions
                  ? field.options?.length ? field.options : [{ id: createId('opcao'), label: 'Opção 1' }, { id: createId('opcao'), label: 'Opção 2' }]
                  : undefined,
                columns: nextType === 'grupo_repetivel'
                  ? field.columns?.length ? field.columns : [{ id: createId('coluna'), label: 'Item', type: 'texto_curto', required: false, ai: { mode: 'sem_acesso' } }]
                  : undefined,
              })
            }}>
              {FIELD_TYPES.map((type) => <option key={type.type} value={type.type}>{type.label}</option>)}
            </select>
          </label>
          <label><span className="form-label">Cor</span><ColorSelect value={field.color} onChange={(color) => onFieldChange({ ...field, color })} /></label>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input type="checkbox" checked={field.required} onChange={(event) => onFieldChange({ ...field, required: event.target.checked })} />Campo obrigatório
          </label>
          <label>
            <span className="form-label">Papel semântico</span>
            <select className="form-input" value={field.semanticRole || ''} onChange={(event) => {
              const semanticRole = event.target.value || undefined
              onFieldChange({
                ...field,
                semanticRole,
                ai: semanticRole && (REVIEW_ONLY_ROLES.has(semanticRole) || semanticRole === 'outros') &&
                  field.ai.mode !== 'sem_acesso'
                  ? { ...field.ai, mode: 'sugerir_revisao' }
                  : field.ai,
              })
            }}>
              {SEMANTIC_ROLES.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
            </select>
          </label>
          {(field.type === 'selecao_unica' || field.type === 'selecao_multipla') ? (
            <label>
              <span className="form-label">Opções (uma por linha)</span>
              <textarea
                className="form-textarea min-h-24"
                value={(field.options || []).map((option) => option.label).join('\n')}
                onChange={(event) => {
                  const labels = event.target.value.split('\n')
                  onFieldChange({
                    ...field,
                    options: labels
                      .map((label) => label.trim())
                      .filter(Boolean)
                      .map((label, index) => ({ id: field.options?.[index]?.id || createId('opcao'), label })),
                  })
                }}
              />
            </label>
          ) : null}
          {field.type === 'grupo_repetivel' ? (
            <RepeaterColumnsEditor columns={field.columns || []} onChange={(columns) => onFieldChange({ ...field, columns })} />
          ) : null}
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-200 pt-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Validacao e relacoes</legend>
          {(field.type === 'texto_curto' || field.type === 'texto_longo') ? (
            <div className="grid grid-cols-2 gap-2">
              <NumberControl
                label="Min. caracteres"
                value={field.validation?.minLength || 0}
                min={0}
                grid={false}
                onChange={(minLength) => onFieldChange({ ...field, validation: { ...field.validation, minLength } })}
              />
              <NumberControl
                label="Max. caracteres"
                value={field.validation?.maxLength || 50000}
                min={1}
                max={100000}
                grid={false}
                onChange={(maxLength) => onFieldChange({ ...field, validation: { ...field.validation, maxLength } })}
              />
            </div>
          ) : null}
          {field.type === 'numero' ? (
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="form-label">Valor minimo</span>
                <input
                  className="form-input"
                  type="number"
                  value={field.validation?.min ?? ''}
                  onChange={(event) => onFieldChange({
                    ...field,
                    validation: {
                      ...field.validation,
                      min: event.target.value === '' ? undefined : Number(event.target.value),
                    },
                  })}
                />
              </label>
              <label>
                <span className="form-label">Valor maximo</span>
                <input
                  className="form-input"
                  type="number"
                  value={field.validation?.max ?? ''}
                  onChange={(event) => onFieldChange({
                    ...field,
                    validation: {
                      ...field.validation,
                      max: event.target.value === '' ? undefined : Number(event.target.value),
                    },
                  })}
                />
              </label>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="form-label mb-0">Relacionamentos no mesmo documento</span>
              <Button
                size="sm"
                disabled={!relationshipTargets.length}
                onClick={() => {
                  const target = relationshipTargets.find((candidate) =>
                    !(field.relationships || []).some((relationship) => relationship.fieldId === candidate.id)
                  )
                  if (!target) return
                  onFieldChange({
                    ...field,
                    relationships: [
                      ...(field.relationships || []),
                      { fieldId: target.id, kind: 'correlaciona_com' },
                    ],
                  })
                }}
              >
                <Plus className="h-3.5 w-3.5" /> Relacao
              </Button>
            </div>
            {(field.relationships || []).map((relationship, index) => (
              <div key={`${relationship.fieldId}-${index}`} className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div className="flex gap-2">
                  <select
                    className="form-input min-w-0 flex-1"
                    aria-label={`Campo relacionado ${index + 1}`}
                    value={relationship.fieldId}
                    onChange={(event) => onFieldChange({
                      ...field,
                      relationships: (field.relationships || []).map((item, itemIndex) =>
                        itemIndex === index ? { ...item, fieldId: event.target.value } : item
                      ),
                    })}
                  >
                    {relationshipTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                  </select>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir relacionamento"
                    onClick={() => onFieldChange({
                      ...field,
                      relationships: (field.relationships || []).filter((_, itemIndex) => itemIndex !== index),
                    })}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
                <select
                  className="form-input"
                  value={relationship.kind}
                  onChange={(event) => onFieldChange({
                    ...field,
                    relationships: (field.relationships || []).map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, kind: event.target.value as NonNullable<ClinicalFormElement['relationships']>[number]['kind'] }
                        : item
                    ),
                  })}
                >
                  <option value="correlaciona_com">Correlaciona com</option>
                  <option value="depende_de">Depende de</option>
                  <option value="exclusivo_com">Exclusivo com</option>
                  <option value="deriva_de">Deriva de</option>
                </select>
                <input
                  className="form-input"
                  maxLength={500}
                  placeholder="Descreva a relacao (opcional)"
                  value={relationship.description || ''}
                  onChange={(event) => onFieldChange({
                    ...field,
                    relationships: (field.relationships || []).map((item, itemIndex) =>
                      itemIndex === index ? { ...item, description: event.target.value || undefined } : item
                    ),
                  })}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-200 pt-4">
          <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">Posição e tamanho</legend>
          <p className="text-[11px] leading-relaxed text-slate-500">Use estes controles como alternativa acessível ao arraste. Valores encaixam em 8 px.</p>
          <div className="grid grid-cols-2 gap-2">
            <NumberControl label="X" value={field.layout.x} min={0} max={CANVAS_WIDTH - field.layout.width} onChange={(value) => setLayout('x', value)} />
            <NumberControl label="Y" value={field.layout.y} min={0} onChange={(value) => setLayout('y', value)} />
            <NumberControl label="Largura" value={field.layout.width} min={MIN_FIELD_WIDTH} max={CANVAS_WIDTH - field.layout.x} onChange={(value) => setLayout('width', value)} />
            <NumberControl label="Altura" value={field.layout.height} min={MIN_FIELD_HEIGHT} onChange={(value) => setLayout('height', value)} />
            <NumberControl label="Camada" value={field.layout.zIndex} min={0} grid={false} onChange={(value) => setLayout('zIndex', value)} />
            <NumberControl label="Ordem mobile" value={field.layout.mobileOrder} min={0} grid={false} onChange={(value) => setLayout('mobileOrder', value)} />
          </div>
        </fieldset>

        <fieldset className="space-y-3 border-t border-slate-200 pt-4">
          <legend className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-600"><Sparkles className="h-3.5 w-3.5" />Permissão da IA</legend>
          <label>
            <span className="form-label">Modo</span>
            <select className="form-input" value={field.ai.mode} disabled={aiModeLocked} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, mode: event.target.value as FormAiMode } })}>
              {AI_MODES.map((mode) => (
                <option
                  key={mode.value}
                  value={mode.value}
                  disabled={aiModeReviewOnly && mode.value !== 'sem_acesso' && mode.value !== 'sugerir_revisao'}
                >
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
          {aiModeLocked || aiModeReviewOnly ? <p className="text-[11px] leading-relaxed text-amber-700">Este tipo ou papel clínico possui uma política de IA restrita para segurança.</p> : null}
          <p className="rounded-md bg-blue-50 p-2 text-[11px] leading-relaxed text-blue-700">{AI_MODES.find((mode) => mode.value === field.ai.mode)?.description}</p>
          {field.ai.mode !== 'sem_acesso' ? (
            <>
              <label>
                <span className="form-label">Significado clínico *</span>
                <textarea
                  className={cn('form-textarea min-h-28', !field.ai.description?.trim() && 'border-amber-400')}
                  value={field.ai.description || ''}
                  maxLength={2000}
                  placeholder="Explique o que deve entrar neste campo, em linguagem objetiva. Não escreva instruções ao modelo."
                  onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, description: event.target.value } })}
                  required
                />
                {!field.ai.description?.trim() ? <span className="mt-1 block text-[11px] text-amber-700">Obrigatório para publicar.</span> : null}
              </label>
              <label><span className="form-label">Evidências permitidas * (uma por linha)</span><textarea className="form-textarea min-h-20" value={(field.ai.allowedEvidence || []).join('\n')} maxLength={3000} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, allowedEvidence: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } })} /></label>
              <label><span className="form-label">Inferências proibidas * (uma por linha)</span><textarea className="form-textarea min-h-20" value={(field.ai.prohibitedInferences || []).join('\n')} maxLength={3000} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, prohibitedInferences: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } })} /></label>
              <label><span className="form-label">Formato esperado</span><input className="form-input" value={field.ai.expectedFormat || ''} maxLength={400} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, expectedFormat: event.target.value } })} /></label>
              <label><span className="form-label">Exemplos * (um por linha)</span><textarea className="form-textarea min-h-20" value={(field.ai.examples || []).join('\n')} maxLength={3000} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, examples: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } })} /></label>
              <label><span className="form-label">Contraexemplos * (um por linha)</span><textarea className="form-textarea min-h-20" value={(field.ai.counterexamples || []).join('\n')} maxLength={3000} onChange={(event) => onFieldChange({ ...field, ai: { ...field.ai, counterexamples: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) } })} /></label>
            </>
          ) : null}
        </fieldset>
      </div>
    </aside>
  )
}

type PreviewMode = 'mobile' | 'desktop'

function RecordPreview({
  definition,
  documentId,
  tabId,
  onClose,
}: {
  definition: ClinicalFormDefinition
  documentId: string
  tabId: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<PreviewMode>('mobile')
  const [previewDocumentId, setPreviewDocumentId] = useState(documentId)
  const [previewTabId, setPreviewTabId] = useState(tabId)
  const previewDocument = getDocument(definition, previewDocumentId) || definition.documents[0]
  const previewTab = previewDocument?.tabs.find((item) => item.id === previewTabId) || previewDocument?.tabs[0]
  const closeRef = useRef<HTMLButtonElement>(null)
  const previewLayouts = previewTab ? resolveDynamicCanvasLayout(previewTab.elements) : {}
  const previewCanvasHeight = Math.max(
    CANVAS_MIN_HEIGHT,
    ...Object.values(previewLayouts).map((layout) => layout.y + layout.height + 64)
  )

  useEffect(() => {
    const previouslyFocused = globalThis.document.activeElement as HTMLElement | null
    const previousOverflow = globalThis.document.body.style.overflow
    globalThis.document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      globalThis.document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [onClose])

  if (!previewDocument || !previewTab) return null
  return (
    <div className="fixed inset-0 z-[80] flex bg-slate-950/60 p-2 sm:p-4" onMouseDown={onClose}>
      <div
        className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl bg-slate-100 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-4 w-4 shrink-0 text-primary-600" />
              <h2 id="record-preview-title" className="truncate text-sm font-semibold text-slate-900">Prévia do prontuário</h2>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">Visualize o rascunho atual sem sair do editor.</p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Tamanho da prévia">
              <Button
                size="sm"
                variant={mode === 'mobile' ? 'primary' : 'ghost'}
                aria-pressed={mode === 'mobile'}
                onClick={() => setMode('mobile')}
              >
                <Smartphone className="h-4 w-4" />Mobile
              </Button>
              <Button
                size="sm"
                variant={mode === 'desktop' ? 'primary' : 'ghost'}
                aria-pressed={mode === 'desktop'}
                onClick={() => setMode('desktop')}
              >
                <Monitor className="h-4 w-4" />Desktop
              </Button>
            </div>
            <Button ref={closeRef} size="icon" variant="ghost" onClick={onClose} aria-label="Fechar prévia"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Documento da prévia">
              {definition.documents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === previewDocument.id}
                  onClick={() => {
                    setPreviewDocumentId(item.id)
                    setPreviewTabId(item.tabs[0]?.id || '')
                  }}
                  className={cn(
                    'flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
                    item.id === previewDocument.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  <IconToken name={item.icon} className="h-3.5 w-3.5" />{item.label}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label={`Abas de ${previewDocument.label}`}>
              {previewDocument.tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={item.id === previewTab.id}
                  onClick={() => setPreviewTabId(item.id)}
                  className={cn(
                    'flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
                    item.id === previewTab.id ? COLOR_ACCENT[item.color] : 'border-transparent text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <IconToken name={item.icon} className="h-3.5 w-3.5" />{item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-5">
          {mode === 'mobile' ? (
            <div className="mx-auto min-h-full max-w-[390px] overflow-hidden rounded-[30px] border-[8px] border-slate-800 bg-white shadow-xl">
              <div className="h-5 bg-slate-800" />
              <div className="p-4">
                <div className={cn('mb-4 rounded-xl border-l-4 p-3', COLOR_ACCENT[previewDocument.color])}>
                  <div className="flex items-center gap-2"><IconToken name={previewDocument.icon} className="h-4 w-4" /><p className="text-sm font-semibold">{previewDocument.label}</p></div>
                  <p className="mt-1 text-xs text-slate-500">{previewTab.label}</p>
                </div>
                <div className="space-y-4">
                  {[...previewTab.elements]
                    .sort((a, b) => a.layout.mobileOrder - b.layout.mobileOrder)
                    .map((field) => (
                      <div key={field.id} className={cn(field.type !== 'titulo' && field.type !== 'divisor' && 'rounded-lg border border-slate-200 bg-slate-50 p-3')}>
                        <FieldPreview field={field} compact />
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto overflow-hidden rounded-xl bg-white shadow-xl" style={{ width: CANVAS_WIDTH }}>
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl border', COLOR_ACCENT[previewDocument.color])}>
                    <IconToken name={previewDocument.icon} className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{previewDocument.label}</p>
                    <p className="text-xs text-slate-500">{previewTab.label}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">Prévia desktop · 1200 px</span>
              </div>
              <div className="relative bg-white" style={{ width: CANVAS_WIDTH, height: previewCanvasHeight }}>
                {previewTab.elements.map((field) => {
                  const layout = previewLayouts[field.id]
                  if (!layout) return null
                  return (
                    <div
                      key={field.id}
                      className={cn(
                        'absolute overflow-hidden rounded-xl p-3 pl-4 shadow-sm',
                        field.type !== 'titulo' && field.type !== 'divisor' && 'border border-slate-200 bg-white'
                      )}
                      style={{
                        left: layout.x,
                        top: layout.y,
                        width: layout.width,
                        height: layout.height,
                        zIndex: layout.zIndex,
                      }}
                    >
                      {field.type !== 'divisor' ? (
                        <span className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', COLORS.find((color) => color.value === field.color)?.swatch)} aria-hidden="true" />
                      ) : null}
                      <FieldPreview field={field} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function FormTemplateEditor() {
  const params = useParams<{ id: string }>()
  const templateId = params.id
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, notify } = useFeedback()
  const canvasRef = useRef<HTMLDivElement>(null)
  const initializedIdRef = useRef<string | null>(null)
  const lastSavedRef = useRef('')
  const latestDefinitionRef = useRef<ClinicalFormDefinition | null>(null)
  const serverUpdatedAtRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const mountedRef = useRef(true)
  const [history, setHistory] = useState<EditorHistory>({ past: [], present: null, future: [] })
  const [selectedDocumentId, setSelectedDocumentId] = useState('')
  const [selectedTabId, setSelectedTabId] = useState('')
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(0.75)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [interaction, setInteraction] = useState<PointerInteraction | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [validationIssues, setValidationIssues] = useState<FormValidationIssue[]>([])

  const templateQuery = useQuery({
    queryKey: ['form-template', templateId],
    queryFn: () => formsApi.get(templateId),
  })

  const template = templateQuery.data?.template
  const definition = history.present
  const document = definition ? getDocument(definition, selectedDocumentId) : undefined
  const tab = definition && document ? getTab(definition, document.id, selectedTabId) : undefined
  const selectedElement = tab?.elements.find((element) => element.id === selectedElementId)
  const canvasHeight = Math.max(
    CANVAS_MIN_HEIGHT,
    ...(tab?.elements.map((element) => element.layout.y + element.layout.height + 80) || [CANVAS_MIN_HEIGHT])
  )

  useEffect(() => {
    if (!template || initializedIdRef.current === template.id) return
    const nextDefinition = normalizeDefinition(template.draftDefinition)
    initializedIdRef.current = template.id
    lastSavedRef.current = JSON.stringify(nextDefinition)
    serverUpdatedAtRef.current = template.updatedAt
    setHistory({ past: [], present: nextDefinition, future: [] })
    const firstDocument = nextDefinition.documents[0]
    setSelectedDocumentId(firstDocument?.id || '')
    setSelectedTabId(firstDocument?.tabs[0]?.id || '')
    setSelectedElementId(null)
  }, [template])

  useEffect(() => {
    if (!definition) return
    const nextDocument = getDocument(definition, selectedDocumentId) || definition.documents[0]
    if (!nextDocument) return
    if (nextDocument.id !== selectedDocumentId) setSelectedDocumentId(nextDocument.id)
    const nextTab = nextDocument.tabs.find((item) => item.id === selectedTabId) || nextDocument.tabs[0]
    if (nextTab && nextTab.id !== selectedTabId) setSelectedTabId(nextTab.id)
    if (selectedElementId && !nextTab?.elements.some((item) => item.id === selectedElementId)) setSelectedElementId(null)
  }, [definition, selectedDocumentId, selectedElementId, selectedTabId])

  useEffect(() => {
    latestDefinitionRef.current = definition
  }, [definition])

  const saveDefinition = useCallback((nextDefinition: ClinicalFormDefinition) => {
    const serialized = JSON.stringify(nextDefinition)
    const job = saveQueueRef.current.catch(() => undefined).then(async () => {
      if (serialized === lastSavedRef.current) return
      if (mountedRef.current) setSaveState('saving')
      try {
        const response = await formsApi.update(templateId, {
          draftDefinition: nextDefinition,
          expectedUpdatedAt: serverUpdatedAtRef.current || undefined,
        })
        lastSavedRef.current = serialized
        serverUpdatedAtRef.current = response.template.updatedAt
        if (mountedRef.current) setSaveState('saved')
        queryClient.setQueryData(['form-template', templateId], response)
      } catch (error) {
        if (mountedRef.current) setSaveState('error')
        throw error
      }
    })
    saveQueueRef.current = job
    return job
  }, [queryClient, templateId])

  useEffect(() => {
    if (!definition || interaction) return
    const serialized = JSON.stringify(definition)
    if (serialized === lastSavedRef.current) return
    setSaveState('saving')
    const timer = window.setTimeout(() => {
      void saveDefinition(definition).catch((error: Error) => {
        notify('error', 'Falha no salvamento automático', error.message)
      })
    }, 900)
    return () => window.clearTimeout(timer)
  }, [definition, interaction, notify, saveDefinition])

  useEffect(() => {
    mountedRef.current = true
    const beforeUnload = (event: BeforeUnloadEvent) => {
      const latest = latestDefinitionRef.current
      if (latest && JSON.stringify(latest) !== lastSavedRef.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      mountedRef.current = false
      const latest = latestDefinitionRef.current
      if (latest && JSON.stringify(latest) !== lastSavedRef.current) {
        void saveDefinition(latest).catch(() => undefined)
      }
    }
  }, [saveDefinition])

  const commit = useCallback((updater: (current: ClinicalFormDefinition) => ClinicalFormDefinition) => {
    setHistory((current) => {
      if (!current.present) return current
      const next = updater(current.present)
      if (next === current.present) return current
      return { past: [...current.past.slice(-49), current.present], present: next, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1)
      if (!previous || !current.present) return current
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future].slice(0, 50) }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0]
      if (!next || !current.present) return current
      return { past: [...current.past, current.present].slice(-50), present: next, future: current.future.slice(1) }
    })
  }, [])

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => window.removeEventListener('keydown', handleKeyboard)
  }, [redo, undo])

  const addElement = useCallback((type: FormElementType, x = 32, y?: number) => {
    if (!definition || !document || !tab) return
    const highestBottom = tab.elements.reduce((max, item) => Math.max(max, item.layout.y + item.layout.height), 0)
    const desired = makeElement(type, x, y ?? highestBottom + 24, tab.elements.length)
    const field = findFreePosition(tab.elements, desired)
    commit((current) => updateTab(current, document.id, tab.id, (currentTab) => ({ ...currentTab, elements: [...currentTab.elements, field] })))
    setSelectedElementId(field.id)
  }, [commit, definition, document, tab])

  const beginInteraction = (event: ReactPointerEvent, field: ClinicalFormElement, kind: 'move' | 'resize') => {
    if (!definition || template?.status === 'arquivado') return
    event.preventDefault()
    event.stopPropagation()
    setSelectedElementId(field.id)
    setInteraction({
      elementId: field.id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      startLayout: field.layout,
      originDefinition: definition,
    })
  }

  useEffect(() => {
    if (!interaction || !document || !tab) return
    const handleMove = (event: PointerEvent) => {
      const deltaX = snap((event.clientX - interaction.startX) / zoom)
      const deltaY = snap((event.clientY - interaction.startY) / zoom)
      setHistory((current) => {
        if (!current.present) return current
        const currentTab = getTab(current.present, document.id, tab.id)
        const element = currentTab?.elements.find((item) => item.id === interaction.elementId)
        if (!currentTab || !element) return current

        const candidate: ClinicalFormElement = interaction.kind === 'move'
          ? {
              ...element,
              layout: {
                ...element.layout,
                x: clamp(interaction.startLayout.x + deltaX, 0, CANVAS_WIDTH - element.layout.width),
                y: Math.max(0, interaction.startLayout.y + deltaY),
              },
            }
          : {
              ...element,
              layout: {
                ...element.layout,
                width: snap(clamp(interaction.startLayout.width + deltaX, MIN_FIELD_WIDTH, CANVAS_WIDTH - element.layout.x)),
                height: snap(Math.max(MIN_FIELD_HEIGHT, interaction.startLayout.height + deltaY)),
              },
            }

        if (hasCollision(currentTab.elements, candidate)) return current
        return {
          ...current,
          present: updateElement(current.present, document.id, tab.id, interaction.elementId, () => candidate),
        }
      })
    }
    const handleUp = () => {
      setHistory((current) => {
        if (!current.present) return current
        const currentTab = getTab(current.present, document.id, tab.id)
        const candidate = currentTab?.elements.find((element) => element.id === interaction.elementId)
        if (!candidate || (currentTab && hasCollision(currentTab.elements, candidate))) {
          notify('info', 'Posição não aplicada', 'Os campos não podem se sobrepor no canvas.')
          return { ...current, present: interaction.originDefinition }
        }
        if (JSON.stringify(interaction.originDefinition) === JSON.stringify(current.present)) return current
        return { past: [...current.past.slice(-49), interaction.originDefinition], present: current.present, future: [] }
      })
      setInteraction(null)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [document, interaction, notify, tab, zoom])

  const moveWithKeyboard = (field: ClinicalFormElement, event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const multiplier = event.shiftKey ? 4 : 1
    const dx = event.key === 'ArrowLeft' ? -GRID_SIZE * multiplier : event.key === 'ArrowRight' ? GRID_SIZE * multiplier : 0
    const dy = event.key === 'ArrowUp' ? -GRID_SIZE * multiplier : event.key === 'ArrowDown' ? GRID_SIZE * multiplier : 0
    if (!document || !tab) return
    const desired = {
      ...field,
      layout: {
        ...field.layout,
        x: clamp(field.layout.x + dx, 0, CANVAS_WIDTH - field.layout.width),
        y: Math.max(0, field.layout.y + dy),
      },
    }
    if (hasCollision(tab.elements, desired)) {
      notify('info', 'Movimento bloqueado', 'Há outro campo nessa posição.')
      return
    }
    commit((current) => updateElement(current, document.id, tab.id, field.id, () => desired))
  }

  const addTab = () => {
    if (!document) return
    const starter = makeElement('titulo', 32, 32, 0)
    starter.label = 'Nova seção'
    const nextTab: ClinicalFormTab = {
      id: createId('aba'),
      label: `Nova aba ${document.tabs.length + 1}`,
      icon: 'LayoutGrid',
      color: 'azul',
      elements: [starter],
    }
    commit((current) => updateDocument(current, document.id, (currentDocument) => ({ ...currentDocument, tabs: [...currentDocument.tabs, nextTab] })))
    setSelectedTabId(nextTab.id)
    setSelectedElementId(null)
  }

  const deleteTab = async () => {
    if (!document || !tab || document.tabs.length <= 1) return
    const accepted = await confirm({
      title: `Excluir a aba “${tab.label}”?`,
      description: `Os ${tab.elements.length} elementos desta aba serão removidos do rascunho. Uma versão já publicada não será alterada.`,
      confirmLabel: 'Excluir aba',
      danger: true,
    })
    if (!accepted) return
    const nextTab = document.tabs.find((item) => item.id !== tab.id)
    commit((current) => updateDocument(current, document.id, (currentDocument) => ({ ...currentDocument, tabs: currentDocument.tabs.filter((item) => item.id !== tab.id) })))
    setSelectedTabId(nextTab?.id || '')
    setSelectedElementId(null)
  }

  const deleteField = async () => {
    if (!document || !tab || !selectedElement) return
    if (tab.elements.length <= 1) {
      notify('info', 'A aba precisa de um elemento', 'Adicione outro componente antes de excluir este campo.')
      return
    }
    const accepted = await confirm({
      title: `Excluir “${selectedElement.label}”?`,
      description: 'O campo será removido apenas deste rascunho. Publicações anteriores permanecem imutáveis.',
      confirmLabel: 'Excluir campo',
      danger: true,
    })
    if (!accepted) return
    commit((current) => updateTab(current, document.id, tab.id, (currentTab) => ({ ...currentTab, elements: currentTab.elements.filter((element) => element.id !== selectedElement.id) })))
    setSelectedElementId(null)
  }

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!definition) throw new Error('Formulário ainda não foi carregado.')
      const issues = validateDefinition(definition)
      setValidationIssues(issues)
      if (issues.length) throw new Error(`Corrija ${issues.length} pendência(s) antes de publicar.`)
      await saveDefinition(definition)
      return formsApi.publish(templateId)
    },
    onSuccess: async ({ template: published }) => {
      queryClient.setQueryData(['form-template', templateId], { template: published })
      await queryClient.invalidateQueries({ queryKey: ['form-templates'] })
      setValidationIssues([])
      notify('success', `Versão ${published.latestVersion?.version || ''} publicada`, 'Novos agendamentos já podem usar esta versão imutável.')
    },
    onError: (error) => notify('error', 'Não foi possível publicar', error.message),
  })

  if (templateQuery.isError) {
    return (
      <div className="p-6"><div className="card"><ErrorState message={templateQuery.error.message} requestId={templateQuery.error instanceof FormsApiError ? templateQuery.error.requestId : undefined} onRetry={() => void templateQuery.refetch()} /></div></div>
    )
  }
  if (templateQuery.isLoading || !definition) {
    return <div className="p-6"><div className="card"><LoadingState label="Abrindo editor..." /></div></div>
  }
  if (!document || !tab || !template) {
    return <div className="p-6"><div className="card"><ErrorState message="O formulário não possui os dois documentos e ao menos uma aba válida." /></div></div>
  }

  return (
    <div className="min-h-dvh bg-slate-100">
      {previewOpen ? (
        <RecordPreview
          definition={definition}
          documentId={document.id}
          tabId={tab.id}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-16 flex-wrap items-center gap-3 px-3 py-2 sm:px-5">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void saveDefinition(definition)
              .then(() => router.push('/formularios'))
              .catch((error: Error) => notify('error', 'Não foi possível sair', error.message))}
            aria-label="Voltar aos formulários"
          ><ArrowLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{template.name}</h1>
              <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', template.status === 'arquivado' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700')}>{template.status === 'arquivado' ? 'Arquivado' : 'Rascunho editável'}</span>
              {template.latestVersion ? <span className="text-xs text-slate-400">publicado v{template.latestVersion.version}</span> : null}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500" role="status" aria-live="polite">
              {saveState === 'saving' ? <><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />Salvando alterações...</> : saveState === 'error' ? <><span className="h-2 w-2 rounded-full bg-red-500" />Falha ao salvar</> : <><span className="h-2 w-2 rounded-full bg-emerald-500" />Alterações salvas</>}
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
            <Button size="icon" variant="ghost" onClick={undo} disabled={!history.past.length} aria-label="Desfazer"><Undo2 className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={redo} disabled={!history.future.length} aria-label="Refazer"><Redo2 className="h-4 w-4" /></Button>
          </div>
          <Button onClick={() => setPreviewOpen(true)}><Eye className="h-4 w-4" />Ver prontuário</Button>
          <Button
            onClick={() => void saveDefinition(definition).then(() => notify('success', 'Rascunho salvo')).catch((error: Error) => notify('error', 'Não foi possível salvar', error.message))}
            disabled={saveState === 'saving'}
          >
            <Save className="h-4 w-4" />Salvar agora
          </Button>
          <Button variant="primary" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || template.status === 'arquivado'}>
            <Rocket className="h-4 w-4" />{publishMutation.isPending ? 'Publicando...' : 'Publicar'}
          </Button>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Documento do formulário">
            {definition.documents.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === document.id}
                onClick={() => { setSelectedDocumentId(item.id); setSelectedTabId(item.tabs[0]?.id || ''); setSelectedElementId(null) }}
                className={cn('flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-medium', item.id === document.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
              >
                <IconToken name={item.icon} className="h-3.5 w-3.5" />{item.label}
              </button>
            ))}
          </div>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label={`Abas de ${document.label}`}>
            {document.tabs.map((item) => (
              <button
                key={item.id}
                role="tab"
                aria-selected={item.id === tab.id}
                onClick={() => { setSelectedTabId(item.id); setSelectedElementId(null) }}
                className={cn('flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium', item.id === tab.id ? COLOR_ACCENT[item.color] : 'border-transparent text-slate-600 hover:bg-slate-100')}
              >
                <IconToken name={item.icon} className="h-3.5 w-3.5" />{item.label}
              </button>
            ))}
            <Button size="icon" variant="ghost" onClick={addTab} aria-label="Adicionar aba"><Plus className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => void deleteTab()} disabled={document.tabs.length <= 1} aria-label={`Excluir aba ${tab.label}`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
          </div>
        </div>
      </div>

      {validationIssues.length ? (
        <section className="border-b border-amber-200 bg-amber-50 px-5 py-3" aria-label="Pendências de publicação">
          <details open>
            <summary className="cursor-pointer text-sm font-semibold text-amber-900">{validationIssues.length} pendência(s) impedem a publicação</summary>
            <ul className="mt-2 grid gap-1 text-xs text-amber-800 lg:grid-cols-2">
              {validationIssues.map((issue, index) => <li key={`${issue.path}-${index}`}><span className="font-semibold">{issue.path}:</span> {issue.message}</li>)}
            </ul>
          </details>
        </section>
      ) : null}

      <div className="grid items-start gap-4 p-3 xl:grid-cols-[240px_minmax(640px,1fr)_320px] xl:p-4">
        <FieldPalette onAdd={addElement} />

        <main className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Editor visual do formulário">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Canvas — {tab.label}</h2>
              <p className="text-[11px] text-slate-500">Arraste pelo topo do campo. O canvas mantém 16 px de distância e bloqueia sobreposições.</p>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" onClick={() => setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.5, 1.25))} disabled={zoom <= 0.5} aria-label="Diminuir zoom"><ZoomOut className="h-4 w-4" /></Button>
              <span className="w-12 text-center text-xs tabular-nums text-slate-500">{Math.round(zoom * 100)}%</span>
              <Button size="icon" variant="ghost" onClick={() => setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.5, 1.25))} disabled={zoom >= 1.25} aria-label="Aumentar zoom"><ZoomIn className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="max-h-[calc(100dvh-260px)] min-h-[600px] overflow-auto bg-slate-200 p-5">
            <div style={{ width: CANVAS_WIDTH * zoom, height: canvasHeight * zoom }}>
              <div
                ref={canvasRef}
                className="relative overflow-hidden bg-white shadow-lg"
                style={{
                  width: CANVAS_WIDTH,
                  height: canvasHeight,
                  transform: `scale(${zoom})`,
                  transformOrigin: 'top left',
                  backgroundImage: 'radial-gradient(circle, rgb(203 213 225) 1px, transparent 1px)',
                  backgroundSize: `${GRID_SIZE}px ${GRID_SIZE}px`,
                }}
                onClick={() => setSelectedElementId(null)}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('application/x-pep-form-element')) {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const type = event.dataTransfer.getData('application/x-pep-form-element') as FormElementType
                  if (!FIELD_TYPES.some((item) => item.type === type)) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  addElement(type, (event.clientX - rect.left) / zoom, (event.clientY - rect.top) / zoom)
                }}
              >
                {!tab.elements.length ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <CopyPlus className="h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-500">Aba vazia</p>
                    <p className="mt-1 max-w-xs text-xs text-slate-400">Arraste um componente da paleta ou selecione-o com o teclado para começar.</p>
                  </div>
                ) : null}
                {tab.elements.map((field) => (
                  <div
                    key={field.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${field.label}, ${fieldTypeLabel(field.type)}. Use as setas para mover.`}
                    aria-pressed={selectedElementId === field.id}
                    onKeyDown={(event) => moveWithKeyboard(field, event)}
                    onClick={(event) => { event.stopPropagation(); setSelectedElementId(field.id) }}
                    className={cn(
                      'group absolute overflow-visible rounded-xl border-2 bg-white p-3 pl-4 text-left shadow-sm outline-none transition-[border-color,box-shadow]',
                      selectedElementId === field.id ? 'border-primary-500 ring-2 ring-primary-100' : 'border-transparent hover:border-slate-300 focus-visible:border-primary-500'
                    )}
                    style={{
                      left: field.layout.x,
                      top: field.layout.y,
                      width: field.layout.width,
                      height: field.layout.height,
                      zIndex: field.layout.zIndex,
                    }}
                  >
                    <span
                      className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', COLORS.find((color) => color.value === field.color)?.swatch)}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className="absolute left-1/2 top-0 z-10 flex h-5 -translate-x-1/2 -translate-y-1/2 cursor-move items-center gap-1 rounded-full border border-slate-300 bg-white px-2 text-[9px] text-slate-500 opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100"
                      onPointerDown={(event) => beginInteraction(event, field, 'move')}
                      aria-label={`Arrastar ${field.label}`}
                    >
                      <Move className="h-3 w-3" />mover
                    </button>
                    <FieldPreview field={field} />
                    <button
                      type="button"
                      className="absolute bottom-0 right-0 z-10 flex h-7 w-7 translate-x-1/3 translate-y-1/3 cursor-nwse-resize items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 opacity-0 shadow-sm group-hover:opacity-100 group-focus-within:opacity-100"
                      onPointerDown={(event) => beginInteraction(event, field, 'resize')}
                      aria-label={`Redimensionar ${field.label}`}
                    >
                      <Maximize2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>

        <FormInspector
          definition={definition}
          document={document}
          tab={tab}
          field={selectedElement}
          onDefinitionChange={(next) => commit(() => next)}
          onDocumentChange={(next) => commit((current) => updateDocument(current, document.id, () => next))}
          onTabChange={(next) => commit((current) => updateTab(current, document.id, tab.id, () => next))}
          onFieldChange={(next) => {
            if (hasCollision(tab.elements, next)) {
              notify('info', 'Alteração de tamanho ou posição bloqueada', 'Os campos não podem se sobrepor no canvas.')
              return
            }
            commit((current) => updateElement(current, document.id, tab.id, next.id, () => next))
          }}
          onDeleteField={() => void deleteField()}
        />
      </div>

      <footer className="border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-500">
        <Link href="/formularios" className="inline-flex items-center gap-1 text-primary-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" />Voltar para Meu formulário</Link>
        <span className="mx-2">·</span>
        O rascunho é salvo automaticamente; agendamentos só recebem versões publicadas.
      </footer>
    </div>
  )
}
