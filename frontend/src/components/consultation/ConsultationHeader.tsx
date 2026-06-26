'use client'
import { Consultation } from '@/types'
import { RecordingState } from '@/hooks/useAudioRecorder'
import { ArrowLeft, Save, FileText, Loader2, CheckCircle2, History } from 'lucide-react'
import Link from 'next/link'
import { calcAge } from '../shared/utils'

interface Props {
  consultation: Consultation
  isSaving: boolean
  isGeneratingSoap: boolean
  isClosing: boolean
  isAutoSaving: boolean
  lastSavedAt: Date | null
  recordingState: RecordingState
  onSave: () => void
  onFinalize: () => void
  onClose: () => void
  onOpenConversation: () => void
}

export function ConsultationHeader({
  consultation,
  isSaving,
  isGeneratingSoap,
  isClosing,
  isAutoSaving,
  lastSavedAt,
  recordingState,
  onSave,
  onFinalize,
  onClose,
  onOpenConversation,
}: Props) {
  const patient = consultation.patient
  const isCompleted = consultation.status === 'completed'

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-4 flex-shrink-0 z-10">
      <Link
        href={patient ? `/patients/${patient.id}` : '/patients'}
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary-50 flex items-center justify-center text-primary-600 font-bold text-sm flex-shrink-0">
            {patient?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {patient?.name || 'Paciente'}
            </p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              {patient?.birthDate && <span>{calcAge(patient.birthDate)}</span>}
              {patient?.sex && <span>· {patient.sex}</span>}
              {patient?.allergies && (
                <span className="text-red-500 font-medium">⚠ {patient.allergies}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Indicador de autosave */}
        <span className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 mr-1">
          {isAutoSaving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" /> Salvando...
            </>
          ) : lastSavedAt ? (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Salvo {lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </>
          ) : (
            <>Salvamento automático ativo</>
          )}
        </span>

        <button
          onClick={onOpenConversation}
          className="btn-secondary text-sm gap-2"
          title="Histórico da conversa: transcrição, tópicos, áudio e edição"
        >
          <History className="w-4 h-4" />
          <span className="hidden md:inline">Conversa</span>
        </button>

        {recordingState === 'idle' && !isGeneratingSoap && (
          <button
            onClick={onFinalize}
            className="btn-secondary text-sm gap-2"
            title="Gerar SOAP com IA"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Gerar SOAP</span>
          </button>
        )}

        {isGeneratingSoap && (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-primary-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Gerando SOAP...</span>
          </div>
        )}

        <button
          onClick={isSaving ? undefined : onSave}
          disabled={isSaving}
          className="btn-secondary text-sm"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">{isSaving ? 'Salvando...' : 'Salvar'}</span>
        </button>

        {isCompleted ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-green-600 bg-green-50 rounded-lg">
            <CheckCircle2 className="w-4 h-4" /> Encerrada
          </span>
        ) : (
          <button
            onClick={onClose}
            disabled={isClosing || recordingState !== 'idle'}
            className="btn-primary text-sm"
            title={recordingState !== 'idle' ? 'Pare a gravação antes de encerrar' : 'Encerrar consulta'}
          >
            {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{isClosing ? 'Encerrando...' : 'Encerrar Consulta'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
