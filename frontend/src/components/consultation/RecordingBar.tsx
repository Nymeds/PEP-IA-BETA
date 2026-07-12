'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudOff, Loader2, Mic, Radio, Sparkles, Square } from 'lucide-react'
import { RecordingState, TranscriptionMode } from '@/hooks/useRealtimeTranscription'
import { cn } from '../shared/utils'

interface Props {
  recordingState: RecordingState
  transcriptionMode: TranscriptionMode
  connectionError?: string | null
  transcript: string
  isInterpreting?: boolean
  onStart: () => void
  onStop: () => void
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export function RecordingBar({
  recordingState,
  transcriptionMode,
  connectionError,
  transcript,
  isInterpreting,
  onStart,
  onStop,
}: Props) {
  const [elapsed, setElapsed] = useState(0)
  const startedAtRef = useRef<number | null>(null)
  const isRecording = recordingState === 'recording'
  const isProcessing = recordingState === 'processing'

  useEffect(() => {
    if (!isRecording) {
      if (recordingState === 'idle') {
        startedAtRef.current = null
        setElapsed(0)
      }
      return
    }
    if (!startedAtRef.current) startedAtRef.current = Date.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isRecording, recordingState])

  const recentTranscript = useMemo(() => {
    const normalized = transcript.trim()
    if (normalized.length <= 700) return normalized
    return `…${normalized.slice(-700)}`
  }, [transcript])

  return (
    <div className="shrink-0 border-t border-slate-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.08)]" role="region" aria-label="Gravação da consulta">
      {(isRecording || isProcessing) && recentTranscript ? (
        <div className="max-h-20 overflow-y-auto border-b border-slate-100 bg-slate-50 px-4 py-2 lg:px-5">
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{recentTranscript}</p>
        </div>
      ) : null}

      <div className="flex min-h-16 flex-wrap items-center gap-3 px-3 py-2.5 sm:flex-nowrap lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', isRecording ? 'animate-pulse bg-red-500' : isProcessing ? 'bg-amber-500' : 'bg-slate-300')} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="font-semibold text-slate-900">{isRecording ? `Gravando ${formatDuration(elapsed)}` : isProcessing ? 'Processando áudio' : 'Gravação pronta'}</span>
              {isRecording ? (
                <span className={cn('inline-flex items-center gap-1 font-medium', transcriptionMode === 'local' ? 'text-amber-700' : 'text-emerald-700')}>
                  {transcriptionMode === 'local' ? <CloudOff className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
                  {transcriptionMode === 'local' ? 'Modo local seguro' : 'Realtime conectado'}
                </span>
              ) : null}
              {isInterpreting ? <span className="inline-flex items-center gap-1 text-primary-700"><Sparkles className="h-3.5 w-3.5" /> Preenchendo PEP</span> : null}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {connectionError || (isRecording ? 'Áudio preservado durante toda a sessão.' : 'Nenhuma gravação ativa.')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={isRecording ? onStop : isProcessing ? undefined : onStart}
          disabled={isProcessing}
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white shadow-md transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
            isRecording ? 'bg-red-600 hover:bg-red-700' : isProcessing ? 'cursor-not-allowed bg-slate-300' : 'bg-primary-600 hover:bg-primary-700'
          )}
          aria-label={isRecording ? 'Parar gravação' : isProcessing ? 'Processando áudio' : 'Iniciar gravação'}
          title={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
        >
          {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : isRecording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}
