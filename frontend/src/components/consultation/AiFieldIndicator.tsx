'use client'
import { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '../shared/utils'

export function AiFieldIcon({ className }: { className?: string }) {
  return (
    <Sparkles
      className={cn('h-3 w-3 text-violet-500 shrink-0', className)}
      aria-label="Preenchido pela IA"
    />
  )
}

export function AiFieldLabel({
  children,
  active,
  className,
}: {
  children: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <label className={cn('inline-flex items-center gap-1.5', className)}>
      {children}
      {active ? <AiFieldIcon /> : null}
    </label>
  )
}

export function AiFieldTitle({
  children,
  active,
  className,
}: {
  children: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {children}
      {active ? <AiFieldIcon /> : null}
    </div>
  )
}
