'use client'
import { RecordingState } from '@/hooks/useRealtimeTranscription'
import { Mic, Square, Loader2, Sparkles } from 'lucide-react'
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
    <div
      className={`fixed bottom-0 right-0 bg-white border-t border-slate-200 transition-all duration-300 z-20`}
      style={{ left: '208px' }}
    >
      {(isRecording || isProcessing) && transcript && (
        <div
          ref={transcriptRef}
          className="px-6 py-3 max-h-32 overflow-y-auto bg-slate-50 border-b border-slate-100 scrollbar-hide"
        >
          <p className="text-xs text-slate-500 mb-1 font-medium">Transcrição em tempo real</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {transcript}
            {isRecording && (
              <span className="inline-block w-0.5 h-4 bg-primary-500 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-4 px-6 py-4">
        {isRecording && (
          <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Gravando...
          </div>
        )}

        {isProcessing && (
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processando áudio...
          </div>
        )}

        {isInterpreting && isRecording && (
          <div className="flex items-center gap-2 text-primary-600 text-sm font-medium">
            <Sparkles className="w-4 h-4 animate-pulse" />
            Interpretando e preenchendo...
          </div>
        )}

        <button
          onClick={isRecording ? onStop : isProcessing ? undefined : onStart}
          disabled={isProcessing}
          className={`
            relative w-14 h-14 rounded-full flex items-center justify-center
            transition-all duration-200 shadow-lg focus:outline-none
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse-recording'
              : isProcessing
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-primary-600 hover:bg-primary-700 text-white hover:shadow-xl hover:scale-105'}
          `}
          title={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
        >
          {isProcessing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : isRecording ? (
            <Square className="w-5 h-5" fill="white" />
          ) : (
            <Mic className="w-6 h-6" />
          )}
        </button>

        {!isRecording && !isProcessing && (
          <p className="text-xs text-slate-400">Clique para iniciar a sessão</p>
        )}

        {isRecording && (
          <button
            onClick={onStop}
            className="text-xs text-slate-400 hover:text-slate-600 underline transition-colors"
          >
            Encerrar sessão
          </button>
        )}
      </div>
    </div>
  )
}
