'use client'

import { TabId, TabStatus } from '@/types'
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartPulse,
  PenLine,
  Search,
  Stethoscope,
  Target,
} from 'lucide-react'
import { cn } from '../shared/utils'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'anamnese', label: 'Anamnese', icon: Stethoscope },
  { id: 'antecedentes', label: 'Antecedentes', icon: ClipboardList },
  { id: 'habitos', label: 'Hábitos de vida', icon: Activity },
  { id: 'revisao_sistemas', label: 'Revisão de sistemas', icon: Search },
  { id: 'exame_fisico', label: 'Exame físico', icon: HeartPulse },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Brain },
  { id: 'conduta', label: 'Conduta', icon: Target },
  { id: 'soap', label: 'SOAP / Evolução', icon: FileText },
]

const STATUS_LABEL: Record<TabStatus, string> = {
  idle: 'Vazio',
  writing: 'Preenchendo',
  incomplete: 'Revisar',
  complete: 'Completo',
}

function StatusIcon({ status }: { status: TabStatus }) {
  if (status === 'writing') return <PenLine className="h-3.5 w-3.5 animate-pulse text-blue-500" />
  if (status === 'incomplete') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
  if (status === 'complete') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
  return <span className="h-2 w-2 rounded-full bg-slate-300" />
}

interface Props {
  activeTab: TabId
  tabStatuses: Record<TabId, TabStatus>
  onTabChange: (tab: TabId) => void
}

export function TabSidebar({ activeTab, tabStatuses, onTabChange }: Props) {
  const completed = Object.values(tabStatuses).filter((status) => status === 'complete').length

  return (
    <aside className="w-full flex-shrink-0 overflow-x-auto border-b border-slate-200 bg-slate-50/80 lg:w-52 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="hidden border-b border-slate-200 px-4 py-3 lg:block">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Prontuário</p>
        <p className="mt-1 text-xs text-slate-500">{completed}/{TABS.length} seções completas</p>
      </div>

      <div className="flex gap-1 p-2 lg:flex-col">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          const status = tabStatuses[id]

          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={cn(
                'group flex min-w-[154px] items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors lg:min-w-0 lg:w-full',
                isActive
                  ? 'border-primary-100 bg-white text-primary-700 shadow-sm'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 flex-shrink-0 transition-colors',
                  isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold leading-tight">{label}</span>
                <span className="mt-0.5 block text-[10px] text-slate-400">{STATUS_LABEL[status]}</span>
              </span>
              <StatusIcon status={status} />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
