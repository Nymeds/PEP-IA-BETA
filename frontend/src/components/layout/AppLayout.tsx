'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, LayoutDashboard, LogOut, Stethoscope, Users } from 'lucide-react'
import { useSession } from '@/components/providers/SessionProvider'
import { cn } from '../shared/utils'

const NAV = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/patients', icon: Users, label: 'Pacientes' },
  { href: '/settings', icon: CalendarDays, label: 'Agendas' },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useSession()

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-2xl flex items-center justify-center shadow-sm">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">PEP IA</p>
              <p className="text-[11px] text-slate-400 leading-tight">Prontuario com IA e agenda medica</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 border-b border-slate-100">
          <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-1">Sessao ativa</p>
            <p className="text-sm font-semibold text-slate-800">{user?.suggestedName || user?.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">{user?.email}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, icon: Icon, label }) => {
            const active =
              pathname === href ||
              (href !== '/' && pathname.startsWith(href)) ||
              (href === '/settings' && pathname.startsWith('/agendas'))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors group',
                  active
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 transition-colors',
                    active ? 'text-white' : 'text-slate-400 group-hover:text-primary-500'
                  )}
                />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button onClick={() => void logout()} className="btn-secondary w-full justify-center">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-3">Uso experimental</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
