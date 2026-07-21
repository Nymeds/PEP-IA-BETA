'use client'

import { useState } from 'react'
import { CalendarRange, ShieldCheck } from 'lucide-react'
import { AgendasSettingsManager } from '@/components/settings/AgendasSettingsManager'
import { RetentionSettingsCard } from '@/components/settings/RetentionSettingsCard'
import { cn } from '@/components/shared/utils'

type SettingsSection = 'agendas' | 'privacidade'

const sections = [
  {
    id: 'agendas' as const,
    label: 'Agendas',
    description: 'Especialidade, prontuário e horários',
    icon: CalendarRange,
  },
  {
    id: 'privacidade' as const,
    label: 'Privacidade e ciclo de vida',
    description: 'Retenção e bloqueio legal',
    icon: ShieldCheck,
  },
]

export function SettingsWorkspace() {
  const [activeSection, setActiveSection] = useState<SettingsSection>('agendas')

  return (
    <>
      <div className="mx-auto max-w-[1440px] px-4 pt-5 sm:px-6 sm:pt-6">
        <nav
          className="grid gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:inline-grid sm:grid-cols-2"
          role="tablist"
          aria-label="Seções das configurações"
        >
          {sections.map((section) => {
            const Icon = section.icon
            const selected = activeSection === section.id

            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                id={`settings-tab-${section.id}`}
                aria-selected={selected}
                aria-controls={`settings-panel-${section.id}`}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-xl px-3.5 py-2 text-left transition-colors sm:min-w-64',
                  selected
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{section.label}</span>
                  <span className={cn('block truncate text-[11px]', selected ? 'text-primary-100' : 'text-slate-400')}>
                    {section.description}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      <div
        id="settings-panel-agendas"
        role="tabpanel"
        aria-labelledby="settings-tab-agendas"
        hidden={activeSection !== 'agendas'}
      >
        <AgendasSettingsManager />
      </div>

      <div
        id="settings-panel-privacidade"
        role="tabpanel"
        aria-labelledby="settings-tab-privacidade"
        hidden={activeSection !== 'privacidade'}
      >
        <RetentionSettingsCard />
      </div>
    </>
  )
}
