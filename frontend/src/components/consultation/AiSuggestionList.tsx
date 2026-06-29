'use client'
import { FieldSuggestion } from '@/types'
import { Check, Lightbulb, X } from 'lucide-react'

interface Props {
  suggestions: FieldSuggestion[]
  title?: string
  onAccept: (suggestion: FieldSuggestion) => void
  onDismiss: (id: string) => void
}

function suggestionText(suggestion: FieldSuggestion) {
  if (suggestion.symptom) return suggestion.symptom.label
  if (suggestion.kind === 'physical_activity' && suggestion.physicalActivity) {
    const activity = suggestion.physicalActivity
    const parts = [
      activity.status || '',
      activity.modalities?.length ? activity.modalities.join(', ') : '',
      activity.frequencyPerWeek ? `${activity.frequencyPerWeek}x/semana` : '',
      activity.durationMinutes ? `${activity.durationMinutes} min` : '',
    ].filter(Boolean)
    return parts.join(' | ') || 'Atividade fisica sugerida'
  }
  return suggestion.valueText || suggestion.label
}

export function AiSuggestionList({
  suggestions,
  title = 'Sugestoes da IA',
  onAccept,
  onDismiss,
}: Props) {
  if (!suggestions.length) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <Lightbulb className="w-4 h-4" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <div
            key={suggestion.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-800 break-words">{suggestionText(suggestion)}</p>
              <p className="text-xs text-slate-500 mt-1">
                {suggestion.evidence || 'Dado parcial ou ambiguo'}
                {typeof suggestion.confidence === 'number'
                  ? ` · confianca ${Math.round(suggestion.confidence * 100)}%`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onAccept(suggestion)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                title="Aplicar sugestao"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onDismiss(suggestion.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Dispensar sugestao"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
