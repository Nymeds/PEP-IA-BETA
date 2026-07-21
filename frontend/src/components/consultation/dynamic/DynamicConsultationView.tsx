'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  FileLock2,
  FileText,
  LayoutPanelLeft,
  Loader2,
  LockKeyhole,
  PanelRight,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import type { Consultation } from '@/types'
import type {
  ClinicalDocumentFormat,
  ClinicalDocumentKind,
  DynamicConsentType,
  DynamicConversationTopic,
  DynamicFormVersionPreview,
  FormColorToken,
  DynamicGeneratedContent,
  DynamicGeneratedDocument,
  DynamicParticipant,
  DynamicQuarantineItem,
} from '@/types/forms'
import { ApiError, api } from '@/services/api'
import { dynamicConsultationApi } from '@/services/dynamic-consultation-api'
import { useDynamicConsultation } from '@/hooks/useDynamicConsultation'
import { TranscriptionMode, useRealtimeTranscription } from '@/hooks/useRealtimeTranscription'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'
import { RecordingBar } from '@/components/consultation/RecordingBar'
import { DynamicTabRenderer } from './DynamicFieldRenderer'
import { DynamicPreparationPanel, isDynamicRecordingReady } from './DynamicPreparationPanel'
import { DynamicReviewPanel } from './DynamicReviewPanel'
import { DynamicEvolutionPanel } from './DynamicEvolutionPanel'
import { DynamicConversationPanel } from './DynamicConversationPanel'
import {
  DynamicMedicationPanel,
  type DynamicMedicationReferenceRecord,
} from './DynamicMedicationPanel'

interface Props {
  consultation: Consultation
}

type AssistantSection = 'preparacao' | 'revisao' | 'medicamentos' | 'evolucao' | 'conversa'
type MobileView = 'formulario' | 'assistente'

const ASSISTANT_SECTIONS: Array<{
  id: AssistantSection
  label: string
  shortLabel: string
}> = [
  { id: 'preparacao', label: 'Consentimentos, participantes e vozes', shortLabel: 'Preparação' },
  { id: 'revisao', label: 'Central de revisão', shortLabel: 'Revisão' },
  { id: 'medicamentos', label: 'Referências de medicamentos', shortLabel: 'Medicamentos' },
  { id: 'evolucao', label: 'SOAP, DAP ou BIRP', shortLabel: 'Evolução' },
  { id: 'conversa', label: 'Conversa e tópicos', shortLabel: 'Conversa' },
]

const STATUS_INFO: Record<string, { label: string; className: string }> = {
  em_espera: { label: 'Em espera', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  scheduled: { label: 'Em espera', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  em_consulta: { label: 'Em consulta', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  active: { label: 'Em consulta', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  finalizado: { label: 'Finalizada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { label: 'Finalizada', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
}

const TAB_NAV_STYLES: Record<FormColorToken, { active: string; icon: string }> = {
  azul: { active: 'bg-blue-50 text-blue-900 ring-blue-100', icon: 'bg-blue-100 text-blue-700' },
  verde: { active: 'bg-emerald-50 text-emerald-900 ring-emerald-100', icon: 'bg-emerald-100 text-emerald-700' },
  amarelo: { active: 'bg-amber-50 text-amber-900 ring-amber-100', icon: 'bg-amber-100 text-amber-700' },
  vermelho: { active: 'bg-red-50 text-red-900 ring-red-100', icon: 'bg-red-100 text-red-700' },
  roxo: { active: 'bg-violet-50 text-violet-900 ring-violet-100', icon: 'bg-violet-100 text-violet-700' },
  cinza: { active: 'bg-slate-100 text-slate-900 ring-slate-200', icon: 'bg-slate-200 text-slate-700' },
  turquesa: { active: 'bg-cyan-50 text-cyan-900 ring-cyan-100', icon: 'bg-cyan-100 text-cyan-700' },
  rosa: { active: 'bg-rose-50 text-rose-900 ring-rose-100', icon: 'bg-rose-100 text-rose-700' },
}

function isWaitingStatus(status: string) {
  return status === 'em_espera' || status === 'scheduled'
}

function isInProgressStatus(status: string) {
  return status === 'em_consulta' || status === 'active'
}

function isFinishedStatus(status: string) {
  return status === 'finalizado' || status === 'completed'
}

function isEmptyValue(value: unknown) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function areDynamicVoicesReady(
  turns: Array<{ diarizationLabel?: string }>,
  participants: DynamicParticipant[]
) {
  if (!turns.length) return false
  const participantsByLabel = new Map(
    participants
      .filter((participant) => participant.active && participant.speakerLabel)
      .map((participant) => [participant.speakerLabel!, participant])
  )
  return turns.every((turn) => {
    if (!turn.diarizationLabel) return false
    const participant = participantsByLabel.get(turn.diarizationLabel)
    return Boolean(participant?.authorized)
  })
}

function DynamicVersionDialog({
  preview,
  busy,
  onClose,
  onConfirm,
}: {
  preview: DynamicFormVersionPreview
  busy: boolean
  onClose: () => void
  onConfirm: (suppressWarning: boolean) => void
}) {
  const [suppressWarning, setSuppressWarning] = useState(false)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const animationFrame = window.requestAnimationFrame(() => cancelButtonRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busyRef.current) return
      event.preventDefault()
      onCloseRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dynamic-version-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="dynamic-version-title" className="text-base font-semibold text-slate-950">
              Atualizar formulário da consulta?
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {preview.current?.name || 'Formulário atual'} v{preview.current?.version || '—'} →{' '}
              {preview.next.name} v{preview.next.version}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-900">{preview.addedFieldIds.length} campo(s) novo(s)</p>
          </div>
          <div className={cn(
            'rounded-lg border p-3',
            preview.orphanedFieldIds.length
              ? 'border-amber-200 bg-amber-50'
              : 'border-slate-200 bg-slate-50'
          )}>
            <p className={cn('text-xs font-semibold', preview.orphanedFieldIds.length ? 'text-amber-900' : 'text-slate-700')}>
              {preview.orphanedFieldIds.length} incompatibilidade(s)
            </p>
          </div>
        </div>

        {preview.incompatibleFields.length ? (
          <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
            {preview.incompatibleFields.map((field) => (
              <p key={`${field.fieldId}:${field.reason}`} className="text-[11px] text-slate-600">
                <strong>{field.fieldId}</strong>: {field.reason.replaceAll('_', ' ')}
              </p>
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-slate-600">
          Valores manuais incompatíveis não serão apagados: permanecem no histórico auditável. A troca só é permitida antes do início.
        </p>

        <label className="mt-4 flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={suppressWarning}
            onChange={(event) => setSuppressWarning(event.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          Não perguntar novamente em futuras trocas. A alteração continuará sendo auditada.
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelButtonRef} onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" onClick={() => onConfirm(suppressWarning)} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Usar nova versão
          </Button>
        </div>
      </div>
    </div>
  )
}

export function DynamicConsultationView({ consultation }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { notify, confirm } = useFeedback()
  const dynamic = useDynamicConsultation(consultation.id)
  const [currentConsultation, setCurrentConsultation] = useState(consultation)
  const [documentKind, setDocumentKind] = useState<ClinicalDocumentKind>('compartilhavel')
  const [activeTabId, setActiveTabId] = useState('')
  const [assistantSection, setAssistantSection] = useState<AssistantSection>('preparacao')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('formulario')
  const [working, setWorking] = useState<string | null>(null)
  const [topics, setTopics] = useState<DynamicConversationTopic[]>([])
  const [lastError, setLastError] = useState<string | null>(null)
  const [adendumReason, setAdendumReason] = useState('')
  const [committedTranscript, setCommittedTranscript] = useState('')
  const [versionPreview, setVersionPreview] = useState<DynamicFormVersionPreview | null>(null)
  const [versionBusy, setVersionBusy] = useState(false)
  const transcriptQueueRef = useRef<Promise<void>>(Promise.resolve())

  const runtime = dynamic.runtime

  useEffect(() => setCurrentConsultation(consultation), [consultation])
  useEffect(() => {
    if (runtime) setCommittedTranscript(runtime.conversation.transcript || '')
  }, [runtime])

  const reportError = useCallback((title: string, error: unknown) => {
    const message = error instanceof Error ? error.message : title
    setLastError(message)
    notify('error', title, message)
  }, [notify])

  const refreshRuntime = useCallback(async () => {
    const result = await dynamic.refetch()
    return result.data?.formMode === 'dynamic' ? result.data : undefined
  }, [dynamic])

  const performDiarization = useCallback(async (announce = true) => {
    setWorking('diarize')
    try {
      const result = await dynamicConsultationApi.diarize(consultation.id)
      await refreshRuntime()
      setAssistantSection('preparacao')
      setAssistantOpen(true)
      setMobileView('assistente')
      setLastError(null)
      if (announce) {
        notify(
          result.requiresConfirmation ? 'info' : 'success',
          result.requiresConfirmation ? 'Confirme as vozes identificadas' : 'Vozes identificadas',
          result.requiresConfirmation
            ? `${result.unknownLabels.length} voz(es) ainda precisam ser associadas a participantes autorizados.`
            : 'Todas as vozes estão associadas a participantes autorizados.'
        )
      }
      return result
    } catch (error) {
      reportError('Não foi possível separar as vozes', error)
      return undefined
    } finally {
      setWorking(null)
    }
  }, [consultation.id, notify, refreshRuntime, reportError])

  const handleTranscriptCompleted = useCallback(async (
    text: string,
    itemId: string,
    payload?: Record<string, unknown>
  ) => {
    const persist = async () => {
      const result = await api.consultations.appendRealtimeTranscript(consultation.id, {
        itemId,
        text,
        payload,
      })
      if (result.appendedText) {
        setCommittedTranscript((current) => [current, result.appendedText].filter(Boolean).join('\n'))
      }
    }
    transcriptQueueRef.current = transcriptQueueRef.current.then(persist, persist)
    try {
      await transcriptQueueRef.current
    } catch (error) {
      reportError('Não foi possível salvar a transcrição em tempo real', error)
    }
  }, [consultation.id, reportError])

  const handleAudioStopped = useCallback(async (
    fullBlob: Blob,
    context: { mode: Exclude<TranscriptionMode, 'none'> }
  ) => {
    try {
      await api.consultations.saveAudio(consultation.id, fullBlob)
      if (context.mode === 'local') {
        const result = await api.consultations.transcribeChunk(consultation.id, fullBlob)
        if (result.chunkTranscript) {
          setCommittedTranscript((current) => [current, result.chunkTranscript].filter(Boolean).join('\n'))
        }
      }
      await refreshRuntime()
      notify('success', 'Áudio preservado', 'A segunda passagem vai separar as vozes para confirmação.')
      await performDiarization()
    } catch (error) {
      reportError('Não foi possível preservar o áudio da consulta', error)
    }
  }, [consultation.id, notify, performDiarization, refreshRuntime, reportError])

  const {
    state: recordingState,
    liveTranscript,
    mode: transcriptionMode,
    connectionError,
    startRecording,
    stopRecording,
  } = useRealtimeTranscription({
    consultationId: consultation.id,
    commitIntervalMs: 8000,
    onTranscriptCompleted: handleTranscriptCompleted,
    onStop: handleAudioStopped,
  })

  useEffect(() => {
    if (connectionError) notify('info', 'Modo local seguro ativado', connectionError)
  }, [connectionError, notify])

  const isWaiting = isWaitingStatus(currentConsultation.status)
  const isInProgress = isInProgressStatus(currentConsultation.status)
  const isFinished = isFinishedStatus(currentConsultation.status)
  const recordingReady = runtime ? isDynamicRecordingReady(runtime) : false
  const voicesReady = runtime
    ? areDynamicVoicesReady(runtime.conversation.turns, runtime.participants)
    : false
  const hasTranscript = Boolean(runtime?.conversation.transcript?.trim() || committedTranscript.trim())
  const canGenerateWithAi = isInProgress && recordingState === 'idle' && recordingReady && voicesReady && hasTranscript
  const canCreateManual = isInProgress && recordingState === 'idle'
  const displayTranscript = [committedTranscript, liveTranscript].filter(Boolean).join('\n')
  const status = STATUS_INFO[currentConsultation.status] || STATUS_INFO.em_espera

  const activeDocument = runtime?.definition.documents.find((document) => document.kind === documentKind)
  const activeTab = activeDocument?.tabs.find((tab) => tab.id === activeTabId) || activeDocument?.tabs[0]
  const runtimeDocument = runtime?.documents.find((document) => document.kind === documentKind)

  useEffect(() => {
    if (!activeDocument?.tabs.length) return
    if (!activeDocument.tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(activeDocument.tabs[0].id)
    }
  }, [activeDocument, activeTabId])

  const assistantBusy = working != null || recordingState !== 'idle'

  const handleStartConsultation = async () => {
    if (working) return
    setWorking('start')
    try {
      const updated = await api.consultations.start(consultation.id)
      setCurrentConsultation(updated)
      queryClient.setQueryData(['consultations', consultation.id], updated)
      notify('success', 'Consulta iniciada', 'O preenchimento manual está liberado. A gravação depende dos consentimentos.')
      setLastError(null)
    } catch (error) {
      reportError('Não foi possível iniciar a consulta', error)
    } finally {
      setWorking(null)
    }
  }

  const handleStartRecording = () => {
    if (!isInProgress) {
      notify('error', 'Inicie a consulta antes de gravar')
      return
    }
    if (!recordingReady) {
      setAssistantSection('preparacao')
      setAssistantOpen(true)
      setMobileView('assistente')
      notify('error', 'Gravação bloqueada', 'Registre os consentimentos de áudio, IA e participantes ativos.')
      return
    }
    void startRecording()
      .then(() => notify('success', 'Gravação iniciada', 'O áudio será preservado para auditoria e diarização.'))
      .catch((error) => reportError('Não foi possível iniciar a gravação', error))
  }

  const handleStopRecording = () => {
    void stopRecording()
      .then(() => notify('info', 'Gravação encerrada', 'Confirme a identificação das vozes antes de usar a IA.'))
      .catch((error) => reportError('Não foi possível encerrar a gravação', error))
  }

  const handleConsent = async (
    type: DynamicConsentType,
    granted: boolean,
    participantId?: string
  ) => {
    setWorking(`consent:${type}:${participantId || 'consulta'}`)
    try {
      await dynamicConsultationApi.recordConsent(consultation.id, {
        type,
        granted,
        participantId,
        evidence: { source: 'interface_consulta', recordedAt: new Date().toISOString() },
      })
      await refreshRuntime()
      notify('success', 'Decisão registrada', 'O registro permanece na trilha de consentimentos.')
    } catch (error) {
      reportError('Não foi possível registrar o consentimento', error)
    } finally {
      setWorking(null)
    }
  }

  const handleAddParticipant = async (data: { name: string; role: string }) => {
    setWorking('participant:add')
    try {
      await dynamicConsultationApi.addParticipant(consultation.id, data)
      await refreshRuntime()
      notify('success', 'Participante cadastrado', 'Agora registre a autorização ou recusa separadamente.')
    } catch (error) {
      reportError('Não foi possível cadastrar o participante', error)
    } finally {
      setWorking(null)
    }
  }

  const handleUpdateParticipant = async (
    participantId: string,
    data: Partial<Pick<DynamicParticipant, 'speakerLabel' | 'active'>>
  ) => {
    setWorking(`participant:${participantId}`)
    try {
      await dynamicConsultationApi.updateParticipant(consultation.id, participantId, data)
      await refreshRuntime()
      notify('success', 'Participante atualizado')
    } catch (error) {
      reportError('Não foi possível atualizar o participante', error)
    } finally {
      setWorking(null)
    }
  }

  const handleInterpret = async () => {
    if (!voicesReady) {
      setAssistantSection('preparacao')
      notify('error', 'Confirme todas as vozes', 'Falas desconhecidas ou não autorizadas não podem alimentar o prontuário.')
      return
    }
    setWorking('interpret')
    try {
      await dynamic.flushPending()
      const result = await dynamicConsultationApi.reinterpret(consultation.id, true)
      await refreshRuntime()
      setAssistantSection('revisao')
      setAssistantOpen(true)
      setLastError(null)
      notify(
        'success',
        'Prontuário reinterpretado',
        `${result.updates.length} campo(s) sugerido(s) e ${result.quarantine.length} item(ns) enviado(s) à revisão.`
      )
    } catch (error) {
      reportError('Não foi possível reinterpretar a consulta', error)
    } finally {
      setWorking(null)
    }
  }

  const handleResolveQuarantine = async (
    item: DynamicQuarantineItem,
    action: 'dismiss' | 'restore',
    restore?: { fieldId: string; documentKind: ClinicalDocumentKind; value: unknown }
  ) => {
    setWorking(`quarantine:${item.id}`)
    try {
      await dynamicConsultationApi.resolveQuarantine(
        consultation.id,
        item.id,
        action === 'dismiss' ? { action } : { action, ...restore! }
      )
      await refreshRuntime()
      notify('success', action === 'dismiss' ? 'Item descartado após revisão' : 'Item restaurado como informação manual')
    } catch (error) {
      reportError('Não foi possível concluir a revisão', error)
    } finally {
      setWorking(null)
    }
  }

  const handleAcceptAiValue = async (
    fieldId: string,
    kind: ClinicalDocumentKind,
    value: unknown
  ) => {
    if (isFinished && adendumReason.trim().length < 5) {
      notify('error', 'Informe o motivo do adendo', 'Consultas finalizadas não podem ser alteradas sem justificativa.')
      return
    }
    dynamic.updateField(kind, fieldId, value, {
      immediate: true,
      reason: isFinished ? adendumReason.trim() : 'Confirmado após revisão profissional',
    })
    await dynamic.flushPending()
    await refreshRuntime()
    notify('success', 'Valor confirmado', 'O valor agora tem proveniência manual e revisão profissional.')
  }

  const handleLoadTopics = async () => {
    setWorking('topics')
    try {
      const result = await dynamicConsultationApi.topics(consultation.id)
      setTopics(result.topics)
      notify('success', 'Tópicos atualizados', `${result.topics.length} assunto(s) com evidência validada.`)
    } catch (error) {
      reportError('Não foi possível organizar os tópicos', error)
    } finally {
      setWorking(null)
    }
  }

  const handleGenerateDocument = async (
    format: ClinicalDocumentFormat,
    kind: ClinicalDocumentKind
  ) => {
    setWorking('document:generate')
    try {
      await dynamic.flushPending()
      await dynamicConsultationApi.generateDocument(consultation.id, {
        format,
        documentKind: kind,
      })
      await refreshRuntime()
      notify('success', `${format} gerado`, 'Revise e edite todas as seções antes de confirmar.')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'SPEAKER_CONFIRMATION_REQUIRED') {
        setAssistantSection('preparacao')
      }
      reportError(`Não foi possível gerar ${format}`, error)
    } finally {
      setWorking(null)
    }
  }

  const handleCreateManualDocument = async (content: DynamicGeneratedContent) => {
    setWorking('document:manual')
    try {
      await dynamic.flushPending()
      await dynamicConsultationApi.generateDocument(consultation.id, {
        format: content.format,
        documentKind: content.documentKind,
        manualContent: content,
      })
      await refreshRuntime()
      notify('success', 'Rascunho manual salvo', 'Confirme a revisão profissional para concluir o documento.')
    } catch (error) {
      reportError('Não foi possível salvar a evolução manual', error)
    } finally {
      setWorking(null)
    }
  }

  const handleConfirmDocument = async (
    document: DynamicGeneratedDocument,
    content: DynamicGeneratedContent,
    reason?: string
  ) => {
    const isAmendment = document.status === 'confirmado'
    const accepted = await confirm({
      title: isAmendment ? 'Registrar adendo imutável?' : 'Confirmar revisão profissional?',
      description: isAmendment
        ? 'O documento original permanecerá preservado. A correção será vinculada com autor, data e motivo.'
        : document.documentKind === 'compartilhavel'
        ? 'O documento compartilhável será confirmado e a consulta será finalizada. Alterações posteriores exigirão adendo com motivo.'
        : 'O registro restrito será confirmado e permanecerá separado do prontuário compartilhável.',
      confirmLabel: isAmendment
        ? 'Registrar adendo'
        : document.documentKind === 'compartilhavel' ? 'Confirmar e finalizar' : 'Confirmar registro',
    })
    if (!accepted) return

    setWorking(`document:confirm:${document.id}`)
    try {
      await dynamic.flushPending()
      await dynamicConsultationApi.confirmDocument(consultation.id, document.id, content, reason)
      await refreshRuntime()
      const updated = await api.consultations.get(consultation.id)
      setCurrentConsultation(updated)
      queryClient.setQueryData(['consultations', consultation.id], updated)
      notify(
        'success',
        isAmendment
          ? 'Adendo registrado'
          : document.documentKind === 'compartilhavel' ? 'Consulta finalizada' : 'Registro restrito confirmado',
        'A revisão, o autor e a data foram registrados.'
      )
    } catch (error) {
      reportError('Não foi possível confirmar o documento', error)
    } finally {
      setWorking(null)
    }
  }

  const handleMedicationSearch = async (name: string) => {
    setWorking('medication:search')
    try {
      const result = await dynamicConsultationApi.medicationReference(consultation.id, name)
      await refreshRuntime()
      notify(
        result.found ? 'success' : 'info',
        result.found ? 'Fonte oficial localizada' : 'Fonte oficial não localizada',
        'A referência não altera o prontuário até ser aceita pelo profissional.'
      )
    } finally {
      setWorking(null)
    }
  }

  const handleMedicationReview = async (
    reference: DynamicMedicationReferenceRecord,
    action: 'accept' | 'dismiss'
  ) => {
    const referenceId = reference.id || reference.recordId
    if (!referenceId) throw new Error('Referência farmacológica sem identificador')
    setWorking(`medication:${referenceId}`)
    try {
      await dynamicConsultationApi.reviewMedicationReference(consultation.id, referenceId, action)
      await refreshRuntime()
      notify('success', action === 'accept' ? 'Referência aceita após revisão' : 'Referência descartada')
    } finally {
      setWorking(null)
    }
  }

  const handleExport = async (kind: ClinicalDocumentKind) => {
    setWorking(`export:${kind}`)
    try {
      await dynamic.flushPending()
      const { blob, filename } = await dynamicConsultationApi.exportDocument(consultation.id, kind)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify('success', kind === 'restrito' ? 'Registro restrito exportado separadamente' : 'Prontuário exportado')
    } catch (error) {
      reportError('Não foi possível exportar o documento', error)
    } finally {
      setWorking(null)
    }
  }

  const applyLatestVersion = async (versionId: string, suppressWarning: boolean) => {
    setVersionBusy(true)
    try {
      const result = await dynamicConsultationApi.changeFormVersion(
        consultation.id,
        versionId,
        suppressWarning
      )
      setVersionPreview(null)
      await refreshRuntime()
      await queryClient.invalidateQueries({ queryKey: ['consultations', consultation.id] })
      notify('success', 'Formulário atualizado', result.message)
    } catch (error) {
      reportError('Não foi possível atualizar o formulário', error)
    } finally {
      setVersionBusy(false)
    }
  }

  const handlePreviewLatestVersion = async () => {
    if (!runtime?.template.latestVersionId) return
    if (runtime.suppressFormChangeWarning) {
      await applyLatestVersion(runtime.template.latestVersionId, true)
      return
    }
    setVersionBusy(true)
    try {
      setVersionPreview(await dynamicConsultationApi.previewFormVersion(
        consultation.id,
        runtime.template.latestVersionId
      ))
    } catch (error) {
      reportError('Não foi possível comparar as versões', error)
    } finally {
      setVersionBusy(false)
    }
  }

  if (dynamic.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary-600" />
          <p className="mt-2 text-sm text-slate-500">Preparando formulário dinâmico...</p>
        </div>
      </div>
    )
  }

  if (dynamic.error || !runtime) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-6 w-6 text-red-600" />
          <h1 className="mt-2 text-base font-semibold text-slate-950">Formulário dinâmico indisponível</h1>
          <p className="mt-1 text-sm text-slate-600">
            {dynamic.error instanceof Error ? dynamic.error.message : 'Não foi possível carregar o runtime desta consulta.'}
          </p>
          <Button className="mt-4" onClick={() => void dynamic.refetch()}>Tentar novamente</Button>
        </div>
      </div>
    )
  }

  const fieldEditingDisabled = isFinished && adendumReason.trim().length < 5
  const pendingReviewCount = runtime.quarantine.filter((item) => item.status === 'pendente').length

  const renderAssistant = () => (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white p-2">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Ferramentas da consulta dinâmica">
          {ASSISTANT_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={assistantSection === section.id}
              title={section.label}
              onClick={() => setAssistantSection(section.id)}
              className={cn(
                'shrink-0 rounded-md px-2.5 py-2 text-[11px] font-semibold',
                assistantSection === section.id
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              )}
            >
              {section.shortLabel}
              {section.id === 'revisao' && pendingReviewCount ? (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-800">
                  {pendingReviewCount}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {assistantSection === 'preparacao' ? (
          <DynamicPreparationPanel
            runtime={runtime}
            busy={assistantBusy}
            isDiarizing={working === 'diarize'}
            onConsent={(type, granted, participantId) => void handleConsent(type, granted, participantId)}
            onAddParticipant={(data) => void handleAddParticipant(data)}
            onUpdateParticipant={(participantId, data) => void handleUpdateParticipant(participantId, data)}
            onDiarize={() => void performDiarization()}
          />
        ) : assistantSection === 'revisao' ? (
          <DynamicReviewPanel
            runtime={runtime}
            busy={assistantBusy}
            onDismiss={(item) => void handleResolveQuarantine(item, 'dismiss')}
            onRestore={(item, fieldId, kind, value) => void handleResolveQuarantine(
              item,
              'restore',
              { fieldId, documentKind: kind, value }
            )}
            onAcceptAiValue={(fieldId, kind, value) => void handleAcceptAiValue(fieldId, kind, value)}
          />
        ) : assistantSection === 'medicamentos' ? (
          <DynamicMedicationPanel
            references={runtime.medicationReferences}
            disabled={assistantBusy || isFinished}
            isSearching={working === 'medication:search'}
            reviewingId={working?.startsWith('medication:') ? working.replace('medication:', '') : null}
            onSearch={handleMedicationSearch}
            onAccept={(reference) => handleMedicationReview(reference, 'accept')}
            onDismiss={(reference) => handleMedicationReview(reference, 'dismiss')}
          />
        ) : assistantSection === 'evolucao' ? (
          <DynamicEvolutionPanel
            runtime={runtime}
            busy={working?.startsWith('document:')}
            canGenerate={canGenerateWithAi}
            canCreateManual={canCreateManual}
            onGenerate={(format, kind) => void handleGenerateDocument(format, kind)}
            onCreateManual={(content) => void handleCreateManualDocument(content)}
            onConfirm={(document, content) => void handleConfirmDocument(document, content)}
          />
        ) : (
          <DynamicConversationPanel
            runtime={runtime}
            topics={topics}
            loadingTopics={working === 'topics'}
            onLoadTopics={() => void handleLoadTopics()}
          />
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50">
      {versionPreview ? (
        <DynamicVersionDialog
          preview={versionPreview}
          busy={versionBusy}
          onClose={() => setVersionPreview(null)}
          onConfirm={(suppressWarning) => void applyLatestVersion(versionPreview.next.id, suppressWarning)}
        />
      ) : null}

      <header className="z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-3 shadow-sm lg:px-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <Link
            href={currentConsultation.patient ? `/patients/${currentConsultation.patient.id}` : '/patients'}
            onClick={(event) => {
              event.preventDefault()
              if (recordingState === 'processing') {
                notify('info', 'Áudio em processamento', 'Aguarde a preservação do áudio antes de sair.')
                return
              }
              const target = currentConsultation.patient ? `/patients/${currentConsultation.patient.id}` : '/patients'
              void (async () => {
                if (recordingState === 'recording') await stopRecording()
                await dynamic.flushPending()
                router.push(target)
              })().catch((error) => reportError('Não foi possível sair com segurança', error))
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Voltar ao paciente"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <div className="hidden h-10 w-10 items-center justify-center rounded-xl bg-violet-50 font-bold text-violet-700 ring-1 ring-violet-100 sm:flex">
            {currentConsultation.patient?.name?.charAt(0).toUpperCase() || 'P'}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold text-slate-950">
                {currentConsultation.patient?.name || 'Paciente'}
              </h1>
              <span className={cn('rounded-full border px-2 py-1 text-[11px] font-semibold', status.className)}>
                {status.label}
              </span>
              <span className="hidden rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 sm:inline-flex">
                Psicologia dinâmica
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {runtime.template.name} · versão {runtime.template.version} · {activeDocument?.label || 'Documento'}
            </p>
          </div>

          <div className="col-span-2 flex w-full flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2 sm:ml-auto sm:w-auto sm:border-0 sm:pt-0">
            <span className="hidden items-center gap-1 text-[11px] text-slate-500 lg:inline-flex" role="status" aria-live="polite">
              {dynamic.saveState === 'error' ? (
                <><CloudOff className="h-3.5 w-3.5 text-red-600" /> Não salvo</>
              ) : dynamic.saveState === 'saving' ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando</>
              ) : dynamic.hasPendingChanges ? (
                <><Save className="h-3.5 w-3.5" /> Alterações pendentes</>
              ) : dynamic.lastSavedAt ? (
                <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Salvo às {dynamic.lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>
              ) : (
                <><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Autosave ativo</>
              )}
            </span>

            <Button size="icon" onClick={() => void dynamic.flushPending()} title="Salvar alterações agora" aria-label="Salvar alterações agora">
              <Save className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={() => void handleExport('compartilhavel')} title="Exportar prontuário compartilhável" aria-label="Exportar prontuário compartilhável">
              <FileText className="h-4 w-4" />
            </Button>
            <Button size="icon" onClick={() => void handleExport('restrito')} title="Exportar registro restrito separadamente" aria-label="Exportar registro restrito separadamente">
              <FileLock2 className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className={cn(assistantOpen && 'border-primary-200 bg-primary-50 text-primary-700')}
              onClick={() => setAssistantOpen((current) => !current)}
              aria-label="Alternar assistente clínico"
              aria-pressed={assistantOpen}
            >
              <PanelRight className="h-4 w-4" />
            </Button>
            {isWaiting ? (
              <Button variant="primary" onClick={() => void handleStartConsultation()} disabled={working === 'start'}>
                {working === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LayoutPanelLeft className="h-4 w-4" />}
                <span className="hidden sm:inline">Iniciar consulta</span>
              </Button>
            ) : isFinished ? (
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Finalizada
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {runtime.template.newVersionAvailable && runtime.canChangeForm ? (
        <div className="shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-blue-900">
              Nova versão {runtime.template.latestVersion} disponível. Esta consulta permanece na versão {runtime.template.version} até você escolher trocar.
            </p>
            <Button size="sm" onClick={() => void handlePreviewLatestVersion()} disabled={versionBusy}>
              {versionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Avaliar nova versão
            </Button>
          </div>
        </div>
      ) : null}

      {isWaiting ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          A consulta pode ser preparada agora. Inicie o atendimento para gravar, gerar evolução ou finalizar.
        </div>
      ) : null}

      {isFinished ? (
        <div className="shrink-0 border-b border-violet-200 bg-violet-50 px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-violet-900">Consulta finalizada: alterações viram adendos</p>
              <p className="mt-0.5 text-[11px] text-violet-700">Informe o motivo antes de editar qualquer campo.</p>
            </div>
            <input
              value={adendumReason}
              onChange={(event) => setAdendumReason(event.target.value)}
              maxLength={2000}
              placeholder="Motivo do adendo"
              className="form-input w-full text-xs sm:w-80"
              aria-label="Motivo do adendo"
            />
          </div>
        </div>
      ) : null}

      {lastError || dynamic.saveError ? (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2" role="alert">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <p className="text-xs text-red-800">{dynamic.saveError || lastError}</p>
            {dynamic.saveError ? <Button size="sm" onClick={() => void dynamic.retryPending()}>Tentar salvar</Button> : null}
          </div>
        </div>
      ) : null}

      <div className="flex shrink-0 border-b border-slate-200 bg-white p-1 md:hidden" role="tablist" aria-label="Área da consulta">
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'formulario'}
          onClick={() => setMobileView('formulario')}
          className={cn('flex-1 rounded-md px-2 py-2 text-xs font-semibold', mobileView === 'formulario' ? 'bg-primary-50 text-primary-700' : 'text-slate-500')}
        >
          Formulário
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileView === 'assistente'}
          onClick={() => setMobileView('assistente')}
          className={cn('flex-1 rounded-md px-2 py-2 text-xs font-semibold', mobileView === 'assistente' ? 'bg-primary-50 text-primary-700' : 'text-slate-500')}
        >
          Assistente {pendingReviewCount ? `(${pendingReviewCount})` : ''}
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 overflow-y-scroll overscroll-contain border-r border-slate-200 bg-white [scrollbar-gutter:stable] md:block">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Seções do documento</p>
          </div>
          <nav className="space-y-1.5 p-3" aria-label="Abas do prontuário">
            {activeDocument?.tabs.map((tab) => {
              const requiredMissing = tab.elements.filter(
                (field) => field.required && isEmptyValue(dynamic.values[documentKind][field.id])
              ).length
              const tabTheme = TAB_NAV_STYLES[tab.color]
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors',
                    activeTab?.id === tab.id
                      ? cn('ring-1', tabTheme.active)
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                  aria-current={activeTab?.id === tab.id ? 'page' : undefined}
                >
                  <span className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold shadow-sm',
                    activeTab?.id === tab.id ? tabTheme.icon : 'bg-white text-slate-500'
                  )}>
                    {tab.label.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  {requiredMissing ? <span className="text-[9px] font-semibold text-amber-700">{requiredMissing}</span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className={cn(
          'min-h-0 min-w-0 flex-1 touch-pan-y overflow-y-scroll overscroll-contain bg-slate-50 [scrollbar-gutter:stable]',
          mobileView === 'formulario' ? 'block' : 'hidden md:block'
        )}>
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
              <div className="grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1" role="tablist" aria-label="Documento clínico">
                <button
                  type="button"
                  role="tab"
                  aria-selected={documentKind === 'compartilhavel'}
                  onClick={() => setDocumentKind('compartilhavel')}
                  className={cn('rounded-md px-3 py-2 text-xs font-semibold', documentKind === 'compartilhavel' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500')}
                >
                  <FileText className="mr-1 inline h-3.5 w-3.5" /> Prontuário
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={documentKind === 'restrito'}
                  onClick={() => setDocumentKind('restrito')}
                  className={cn('rounded-md px-3 py-2 text-xs font-semibold', documentKind === 'restrito' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500')}
                >
                  <LockKeyhole className="mr-1 inline h-3.5 w-3.5" /> Registro restrito
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {hasTranscript && voicesReady ? (
                  <span className="hidden items-center gap-1 text-[11px] font-semibold text-emerald-700 lg:inline-flex">
                    <ShieldCheck className="h-3.5 w-3.5" /> Vozes confirmadas
                  </span>
                ) : hasTranscript ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAssistantSection('preparacao')
                      setAssistantOpen(true)
                    }}
                    className="hidden items-center gap-1 text-[11px] font-semibold text-amber-700 lg:inline-flex"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Confirmar vozes
                  </button>
                ) : null}
                <Button
                  size="sm"
                  onClick={() => void handleInterpret()}
                  disabled={!canGenerateWithAi || working === 'interpret'}
                  title={!voicesReady ? 'Confirme as vozes antes de usar a IA' : 'Reinterpretar o formulário com evidências validadas'}
                >
                  {working === 'interpret' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Atualizar com IA
                </Button>
              </div>
            </div>

            <div className="mx-auto mt-2 flex max-w-7xl gap-1 overflow-x-auto pb-1 md:hidden" role="tablist" aria-label="Abas do documento">
              {activeDocument?.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab?.id === tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={cn(
                    'shrink-0 rounded-md px-3 py-2 text-xs font-medium',
                    activeTab?.id === tab.id ? 'bg-primary-50 text-primary-700' : 'bg-slate-50 text-slate-600'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[1440px] px-3 pb-24 pt-5 lg:px-6 lg:pt-6">
            {documentKind === 'restrito' ? (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                <div>
                  <p className="text-xs font-semibold text-violet-900">Registro psicológico restrito</p>
                  <p className="mt-0.5 text-[11px] text-violet-700">Não é incluído no prontuário compartilhável nem em sua exportação.</p>
                </div>
              </div>
            ) : null}
            {activeTab ? (
              <DynamicTabRenderer
                tab={activeTab}
                values={dynamic.values[documentKind]}
                metadata={runtimeDocument?.values || {}}
                disabled={fieldEditingDisabled}
                onChange={(fieldId, value) => dynamic.updateField(documentKind, fieldId, value, {
                  reason: isFinished ? adendumReason.trim() : undefined,
                })}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                Nenhuma aba foi cadastrada neste documento.
              </div>
            )}
          </div>
        </main>

        <section className={cn(
          'min-h-0 flex-1 overflow-hidden md:hidden',
          mobileView === 'assistente' ? 'block' : 'hidden'
        )}>
          {renderAssistant()}
        </section>

        {assistantOpen ? (
          <aside className="hidden w-[400px] shrink-0 overflow-hidden border-l border-slate-200 bg-white xl:block">
            {renderAssistant()}
          </aside>
        ) : null}

        {assistantOpen ? (
          <div className="fixed inset-0 z-40 hidden md:block xl:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/35" onClick={() => setAssistantOpen(false)} aria-label="Fechar assistente clínico" />
            <aside className="absolute inset-y-0 right-0 w-[min(420px,94vw)] overflow-hidden border-l border-slate-200 bg-white shadow-xl">
              <div className="absolute right-2 top-2 z-20">
                <Button size="icon" variant="ghost" onClick={() => setAssistantOpen(false)} aria-label="Fechar assistente clínico">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {renderAssistant()}
            </aside>
          </div>
        ) : null}
      </div>

      {isInProgress ? (
        <RecordingBar
          recordingState={recordingState}
          transcriptionMode={transcriptionMode}
          connectionError={connectionError}
          transcript={displayTranscript}
          isInterpreting={working === 'interpret'}
          disabled={!recordingReady}
          disabledReason="Registre consentimentos de áudio, IA e participantes antes de gravar"
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      ) : null}
    </div>
  )
}
