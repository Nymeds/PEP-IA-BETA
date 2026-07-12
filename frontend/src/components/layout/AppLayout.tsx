'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { useSession } from '@/components/providers/SessionProvider'
import { usePersistentState } from '@/hooks/usePersistentState'
import { cn } from '../shared/utils'

const NAV = [
  { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/patients', icon: Users, label: 'Pacientes' },
  { href: '/settings', icon: CalendarDays, label: 'Agendas' },
]

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== '/' && pathname.startsWith(href)) ||
    (href === '/settings' && pathname.startsWith('/agendas'))
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, logout } = useSession()
  const [collapsed, setCollapsed] = usePersistentState('pep-ui:sidebar-collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => setMobileOpen(false), [pathname])

  const navigationCollapsed = collapsed && !mobileOpen
  const navigation = (
    <>
      <div className={cn('flex h-16 items-center border-b border-slate-200', navigationCollapsed ? 'justify-center px-2' : 'gap-3 px-4')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Stethoscope className="h-5 w-5" aria-hidden="true" />
        </div>
        {!navigationCollapsed ? (
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-950">PEP IA</p>
            <p className="truncate text-[11px] text-slate-500">Atendimento clínico assistido</p>
          </div>
        ) : null}
      </div>

      {!navigationCollapsed ? (
        <div className="border-b border-slate-200 px-3 py-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Sessão ativa</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{user?.suggestedName || user?.name}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
      ) : null}

      <nav className="flex-1 space-y-1 p-2" aria-label="Navegação principal">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = isActivePath(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              title={navigationCollapsed ? label : undefined}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex min-h-10 items-center rounded-md text-sm font-medium transition-colors',
                navigationCollapsed ? 'justify-center px-2' : 'gap-3 px-3',
                active
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700')} aria-hidden="true" />
              {!navigationCollapsed ? <span>{label}</span> : <span className="sr-only">{label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-slate-200 p-2">
        <button
          type="button"
          onClick={() => void logout()}
          title={navigationCollapsed ? 'Sair' : undefined}
          className={cn(
            'flex min-h-10 w-full items-center rounded-md text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700',
            navigationCollapsed ? 'justify-center px-2' : 'gap-3 px-3'
          )}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {!navigationCollapsed ? 'Sair' : <span className="sr-only">Sair</span>}
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="mt-1 hidden min-h-9 w-full items-center justify-center gap-2 rounded-md text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:flex"
          aria-label={navigationCollapsed ? 'Expandir navegação' : 'Recolher navegação'}
        >
          {navigationCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!navigationCollapsed ? 'Recolher' : null}
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-dvh bg-slate-50">
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[72px]' : 'w-60'
        )}
      >
        {navigation}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar navegação"
          />
          <aside className="relative flex h-full w-[min(288px,86vw)] flex-col bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Navegação">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-md p-2 text-slate-500 hover:bg-slate-100"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar navegação"
            >
              <X className="h-5 w-5" />
            </button>
            {navigation}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Abrir navegação"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-primary-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-slate-950">PEP IA</span>
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  )
}
