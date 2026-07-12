'use client'

import { useEffect, useRef, useState } from 'react'
import { PenLine, X } from 'lucide-react'
import { ClinicalSuggestion } from '@/types'
import { Button } from '@/components/ui/Button'

function readableValue(value?: string) {
  if (!value) return ''
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)
  } catch {
    return value
  }
}

function serializedValue(original: string | undefined, edited: string) {
  if (!original) return edited
  try {
    const parsedOriginal = JSON.parse(original)
    if (typeof parsedOriginal === 'string') return edited
    return JSON.stringify(JSON.parse(edited))
  } catch {
    return edited
  }
}

export function SuggestionReviewDialog({ suggestion, onClose, onConfirm }: {
  suggestion: ClinicalSuggestion | null
  onClose: () => void
  onConfirm: (suggestion: ClinicalSuggestion, value: string) => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!suggestion) return
    setValue(readableValue(suggestion.proposedValue))
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [suggestion])

  if (!suggestion) return null

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="suggestion-review-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2"><PenLine className="h-4 w-4 text-primary-600" /><h2 id="suggestion-review-title" className="text-sm font-semibold text-slate-950">Revisar sugestão antes de aplicar</h2></div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-4">
          <div><p className="text-xs font-semibold text-slate-900">{suggestion.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{suggestion.message}</p></div>
          {suggestion.evidence[0]?.quote ? <blockquote className="border-l-2 border-amber-300 pl-3 text-xs italic leading-relaxed text-slate-600">“{suggestion.evidence[0].quote}”</blockquote> : null}
          <div><label htmlFor="suggestion-value" className="form-label">Valor que será registrado</label><textarea ref={inputRef} id="suggestion-value" rows={6} value={value} onChange={(event) => setValue(event.target.value)} className="form-textarea font-mono text-xs" /></div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3"><Button onClick={onClose}>Cancelar</Button><Button variant="primary" disabled={!value.trim()} onClick={() => onConfirm(suggestion, serializedValue(suggestion.proposedValue, value))}>Aplicar valor revisado</Button></div>
      </div>
    </div>
  )
}
