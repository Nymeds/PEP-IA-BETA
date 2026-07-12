import { AlertCircle, Inbox, Loader2, RotateCw } from 'lucide-react'
import { Button } from './Button'

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, description, action }: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-5 py-8 text-center">
      <Inbox className="mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs leading-relaxed text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, requestId, onRetry }: {
  message: string
  requestId?: string
  onRetry?: () => void
}) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center px-5 py-8 text-center" role="alert">
      <AlertCircle className="mb-2 h-6 w-6 text-red-500" aria-hidden="true" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {requestId ? <p className="mt-1 text-[11px] text-slate-400">Referência: {requestId}</p> : null}
      {onRetry ? (
        <Button className="mt-3" size="sm" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  )
}
