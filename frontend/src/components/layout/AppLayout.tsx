import Link from 'next/link'
import { Stethoscope, Users, LayoutDashboard, Settings } from 'lucide-react'

const NAV = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/patients', icon: Users, label: 'Pacientes' },
  { href: '/settings', icon: Settings, label: 'Configurações' },
]

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">PEP IA</p>
              <p className="text-[10px] text-slate-400 leading-tight">Prontuário com IA</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {NAV.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600
                         hover:bg-slate-50 hover:text-slate-900 transition-colors group"
            >
              <Icon className="w-4 h-4 text-slate-400 group-hover:text-primary-500 transition-colors" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 text-center">MVP v1.0 — Uso experimental</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
