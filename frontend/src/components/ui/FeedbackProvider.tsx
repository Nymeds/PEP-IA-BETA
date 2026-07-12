'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/components/shared/utils'
import { Button } from './Button'

type FeedbackKind = 'success' | 'info' | 'error'

interface ToastMessage {
  id: number
  kind: FeedbackKind
  title: string
  description?: string
}

interface ConfirmOptions {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface FeedbackContextValue {
  notify: (kind: FeedbackKind, title: string, description?: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [confirmation, setConfirmation] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const notify = useCallback((kind: FeedbackKind, title: string, description?: string) => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current.slice(-2), { id, kind, title, description }])
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 5000)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null
    return new Promise<boolean>((resolve) => setConfirmation({ ...options, resolve }))
  }, [])

  const closeConfirmation = useCallback((value: boolean) => {
    setConfirmation((current) => {
      current?.resolve(value)
      return null
    })
    window.setTimeout(() => previousFocusRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!confirmation) return
    confirmButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeConfirmation(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeConfirmation, confirmation])

  const value = useMemo(() => ({ notify, confirm }), [confirm, notify])

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
          return (
            <div
              key={toast.id}
              className={cn(
                'pointer-events-auto flex gap-3 rounded-lg border bg-white p-3 shadow-lg',
                toast.kind === 'error' ? 'border-red-200' : toast.kind === 'success' ? 'border-emerald-200' : 'border-slate-200'
              )}
              role={toast.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toast.kind === 'error' ? 'text-red-600' : toast.kind === 'success' ? 'text-emerald-600' : 'text-primary-600')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar mensagem"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>

      {confirmation ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={() => closeConfirmation(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="global-confirm-title"
            aria-describedby="global-confirm-description"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="global-confirm-title" className="text-base font-semibold text-slate-950">{confirmation.title}</h2>
            <p id="global-confirm-description" className="mt-2 text-sm leading-relaxed text-slate-600">{confirmation.description}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => closeConfirmation(false)}>{confirmation.cancelLabel || 'Cancelar'}</Button>
              <Button
                ref={confirmButtonRef}
                variant={confirmation.danger ? 'danger' : 'primary'}
                onClick={() => closeConfirmation(true)}
              >
                {confirmation.confirmLabel || 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const context = useContext(FeedbackContext)
  if (!context) throw new Error('useFeedback precisa estar dentro de FeedbackProvider')
  return context
}
