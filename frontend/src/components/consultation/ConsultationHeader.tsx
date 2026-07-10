'use client'

import Link from 'next/link'
import { ArrowLeft, CalendarClock, CheckCircle2, FileText, History, Loader2, Save } from 'lucide-react'
import { useSession } from '@/components/providers/SessionProvider'
import { RecordingState } from '@/hooks/useRealtimeTranscription'
import { Consultation } from '@/types'
import { calcAge, cn } from '../shared/utils'

interface Props {
  consultation: Consultation
  isSaving: boolean
  isGeneratingSoap: boolean
  isClosing: boolean
  isStarting: boolean
  isAutoSaving: boolean
  lastSavedAt: Date | null
  recordingState: RecordingState
  onSave: () => void
  onStart: () => void
  onFinalize: () => void
  onClose: () => void
  onOpenConversation: () => void
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  em_espera: { label: 'Em espera', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  scheduled: { label: 'Em espera', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  em_consulta: { label: 'Em consulta', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  active: { label: 'Em consulta', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
  finalizado: { label: 'Encerrada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  completed: { label: 'Encerrada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
}

export function ConsultationHeader({
  consultation,
  isSaving,
  isGeneratingSoap,
  isClosing,
  isStarting,
  isAutoSaving,
  lastSavedAt,
  recordingState,
  onSave,
  onStart,
  onFinalize,
  onClose,
  onOpenConversation,
}: Props) {
  const patient = consultation.patient
  const isWaiting = consultation.status === 'em_espera' || consultation.status === 'scheduled'
  const isInProgress = consultation.status === 'em_consulta' || consultation.status === 'active'
  const isCompleted = consultation.status === 'finalizado' || consultation.status === 'completed'
  const status = STATUS_LABEL[consultation.status] || STATUS_LABEL.em_espera
  const { user } = useSession()

  return (
    <header className="z-10 flex flex-shrink-0 flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link
          href={patient ? `/patients/${patient.id}` : '/patients'}
          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          title="Voltar ao paciente"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>

        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-sm font-bold text-primary-700 ring-1 ring-primary-100">
          {patient?.name?.charAt(0).toUpperCase() || '?'}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-slate-950">{patient?.name || 'Paciente'}</p>
            <span className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', status.cls)}>
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            {user?.suggestedName ? <span>Sessão de {user.suggestedName}</span> : null}
            {patient?.birthDate ? <span>{calcAge(patient.birthDate)}</span> : null}
            {patient?.sex ? <span>{patient.sex}</span> : null}
            {patient?.allergies ? (
              <span className="font-medium text-red-600">Alergia: {patient.allergies}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <span className="hidden items-center gap-1.5 text-xs text-slate-400 xl:flex">
          {isAutoSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando
            </>
          ) : lastSavedAt ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              Salvo {lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </>
          ) : (
            <>Autosave ativo</>
          )}
        </span>

        <button
          type="button"
          onClick={onOpenConversation}
          className="btn-secondary text-sm"
          title="Histórico da conversa, transcrição, tópicos, áudio e versões"
        >
          <History className="h-4 w-4" />
          <span className="hidden md:inline">Conversa</span>
        </button>

        {recordingState === 'idle' && !isGeneratingSoap && isInProgress ? (
          <button type="button" onClick={onFinalize} className="btn-secondary text-sm" title="Gerar SOAP com IA">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Gerar SOAP</span>
          </button>
        ) : null}

        {isGeneratingSoap ? (
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-primary-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Gerando SOAP</span>
          </div>
        ) : null}

        <button type="button" onClick={onSave} disabled={isSaving} className="btn-secondary text-sm">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="hidden sm:inline">{isSaving ? 'Salvando' : 'Salvar'}</span>
        </button>

        {isWaiting ? (
          <button type="button" onClick={onStart} disabled={isStarting} className="btn-primary text-sm">
            {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            <span className="hidden sm:inline">{isStarting ? 'Iniciando' : 'Iniciar consulta'}</span>
          </button>
        ) : isCompleted ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Encerrada
          </span>
        ) : (
          <button
            type="button"
            onClick={onClose}
            disabled={isClosing || recordingState !== 'idle'}
            className="btn-primary text-sm"
            title={recordingState !== 'idle' ? 'Pare a gravação antes de encerrar' : 'Encerrar consulta'}
          >
            {isClosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isClosing ? 'Encerrando' : 'Encerrar consulta'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
