'use client'

import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '../shared/utils'

export type FeedbackKind = 'success' | 'error' | 'info'

export interface FeedbackMessage {
  id: number
  kind: FeedbackKind
  title: string
  description?: string
}

const STYLE: Record<FeedbackKind, { box: string; icon: string; Icon: LucideIcon }> = {
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    icon: 'text-emerald-600',
    Icon: CheckCircle2,
  },
  error: {
    box: 'border-red-200 bg-red-50 text-red-900',
    icon: 'text-red-600',
    Icon: AlertCircle,
  },
  info: {
    box: 'border-blue-200 bg-blue-50 text-blue-900',
    icon: 'text-blue-600',
    Icon: Info,
  },
}

export function FeedbackToast({
  message,
  onClose,
}: {
  message: FeedbackMessage | null
  onClose: () => void
}) {
  if (!message) return null

  const style = STYLE[message.kind]
  const Icon = style.Icon

  return (
    <div className="fixed right-4 top-4 z-[70] w-[calc(100vw-2rem)] max-w-sm">
      <div className={cn('rounded-lg border px-4 py-3 shadow-lg', style.box)}>
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', style.icon)} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{message.title}</p>
            {message.description ? (
              <p className="mt-1 text-xs leading-relaxed opacity-80">{message.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 opacity-60 transition-opacity hover:opacity-100"
            aria-label="Fechar aviso"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
