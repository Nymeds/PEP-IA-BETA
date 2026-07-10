'use client'

import { RecordingState } from '@/hooks/useRealtimeTranscription'
import { Loader2, Mic, Sparkles, Square } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface Props {
  recordingState: RecordingState
  transcript: string
  isInterpreting?: boolean
  onStart: () => void
  onStop: () => void
}

export function RecordingBar({ recordingState, transcript, isInterpreting, onStart, onStop }: Props) {
  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const isRecording = recordingState === 'recording'
  const isProcessing = recordingState === 'processing'

  return (
    <div className="flex-shrink-0 border-t border-slate-200 bg-white shadow-[0_-12px_30px_rgba(15,23,42,0.08)]">
      {(isRecording || isProcessing) && transcript ? (
        <div
          ref={transcriptRef}
          className="max-h-32 overflow-y-auto border-b border-slate-100 bg-slate-50 px-4 py-3 scrollbar-hide lg:px-6"
        >
          <p className="mb-1 text-xs font-medium text-slate-500">Transcrição em tempo real</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {transcript}
            {isRecording ? (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary-500 align-middle" />
            ) : null}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4 lg:gap-4 lg:px-6">
        {isRecording ? (
          <div className="flex items-center gap-2 text-sm font-medium text-red-500">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Gravando
          </div>
        ) : null}

        {isProcessing ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Processando áudio
          </div>
        ) : null}

        {isInterpreting && isRecording ? (
          <div className="flex items-center gap-2 text-sm font-medium text-primary-600">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Interpretando e preenchendo
          </div>
        ) : null}

        <button
          type="button"
          onClick={isRecording ? onStop : isProcessing ? undefined : onStart}
          disabled={isProcessing}
          className={`
            relative flex h-14 w-14 items-center justify-center rounded-full
            shadow-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
            ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse-recording'
                : isProcessing
                  ? 'cursor-not-allowed bg-slate-100 text-slate-400'
                  : 'bg-primary-600 text-white hover:scale-105 hover:bg-primary-700 hover:shadow-xl'
            }
          `}
          title={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isRecording ? (
            <Square className="h-5 w-5" fill="white" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </button>

        {!isRecording && !isProcessing ? (
          <p className="text-xs text-slate-400">Clique para iniciar a sessão</p>
        ) : null}

        {isRecording ? (
          <button
            type="button"
            onClick={onStop}
            className="text-xs text-slate-400 underline transition-colors hover:text-slate-600"
          >
            Encerrar sessão
          </button>
        ) : null}
      </div>
    </div>
  )
}
