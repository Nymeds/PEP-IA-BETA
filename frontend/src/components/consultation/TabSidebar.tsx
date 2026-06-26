'use client'
import { TabId, TabStatus } from '@/types'
import {
  Stethoscope,
  ClipboardList,
  Activity,
  Search,
  HeartPulse,
  Brain,
  Target,
  Pill,
  FileText,
  AlertTriangle,
  PenLine,
  CheckCircle2,
} from 'lucide-react'
import { cn } from '../shared/utils'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'anamnese', label: 'Anamnese', icon: Stethoscope },
  { id: 'antecedentes', label: 'Antecedentes', icon: ClipboardList },
  { id: 'habitos', label: 'Hábitos de Vida', icon: Activity },
  { id: 'revisao_sistemas', label: 'Revisão de Sistemas', icon: Search },
  { id: 'exame_fisico', label: 'Exame Físico', icon: HeartPulse },
  { id: 'diagnostico', label: 'Diagnóstico', icon: Brain },
  { id: 'conduta', label: 'Conduta', icon: Target },
  { id: 'soap', label: 'SOAP / Evolução', icon: FileText },
]

const StatusIcon = ({ status }: { status: TabStatus }) => {
  if (status === 'writing') return <PenLine className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
  if (status === 'incomplete') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
  if (status === 'complete') return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
  return null
}

interface Props {
  activeTab: TabId
  tabStatuses: Record<TabId, TabStatus>
  onTabChange: (tab: TabId) => void
}

export function TabSidebar({ activeTab, tabStatuses, onTabChange }: Props) {
  return (
    <aside className="w-52 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto">
      <div className="p-2 space-y-0.5">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id
          const status = tabStatuses[id]

          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all group',
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              <Icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  isActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'
                )}
              />
              <span className="text-xs font-medium flex-1 leading-tight">{label}</span>
              <StatusIcon status={status} />
            </button>
          )
        })}
      </div>
    </aside>
  )
}
