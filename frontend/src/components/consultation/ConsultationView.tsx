'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClinicalSuggestion, ClinicalTemplateId, Consultation, FieldProvenance } from '@/types'
import { useConsultation } from '@/hooks/useConsultation'
import { useRealtimeTranscription } from '@/hooks/useRealtimeTranscription'
import { api } from '@/services/api'
import { ConfirmDialog } from './ConfirmDialog'
import { ConsultationHeader } from './ConsultationHeader'
import { ConversationModal } from './ConversationModal'
import { FeedbackMessage, FeedbackToast } from './FeedbackToast'
import { MedicalToolsPanel } from './MedicalToolsPanel'
import { RecordingBar } from './RecordingBar'
import { TabSidebar } from './TabSidebar'
import { AnamneseTab } from './tabs/AnamneseTab'
import { AntecedentesTab } from './tabs/AntecedentesTab'
import { CondustaTab } from './tabs/CondustaTab'
import { DiagnosticoTab } from './tabs/DiagnosticoTab'
import { ExameFisicoTab } from './tabs/ExameFisicoTab'
import { HabitosTab } from './tabs/HabitosTab'
import { RevisaoSistemasTab } from './tabs/RevisaoSistemasTab'
import { SoapTab } from './tabs/SoapTab'

interface Props {
  consultation: Consultation
}

function soapText(consultation: Consultation) {
  return [
    `S: ${consultation.subjective || ''}`,
    `O: ${consultation.objective || ''}`,
    `A: ${consultation.assessment || ''}`,
    `P: ${consultation.plan || ''}`,
  ].join('\n\n')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function parseAiJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function suggestionValue(field: string, value: string): unknown {
  if (field === 'weight' || field === 'height') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : value
  }
  return value
}

export function ConsultationView({ consultation }: Props) {
  const {
    consultation: data,
    transcript,
    activeTab,
    setActiveTab,
    tabStatuses,
    isSaving,
    mergeExtracted,
    addTranscript,
    applySoap,
    saveConsultation,
    updateField,
    applyConsultation,
    isAutoSaving,
    lastSavedAt,
  } = useConsultation(consultation)

  const router = useRouter()
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<ClinicalSuggestion[]>(() =>
    parseAiJson(consultation.aiState?.suggestionsJson, [])
  )
  const [fieldMeta, setFieldMeta] = useState<Record<string, FieldProvenance>>(() =>
    parseAiJson(consultation.aiState?.fieldMetaJson, {})
  )
  const [templateId, setTemplateId] = useState<ClinicalTemplateId>(
    consultation.aiState?.templateId || 'clinica_geral'
  )

  const segmentsSinceReinterpret = useRef(0)
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve())
  const REINTERPRET_EVERY = 1
  const isReinterpretingRef = useRef(false)
  const reinterpretPendingRef = useRef(false)

  const notify = useCallback((kind: FeedbackMessage['kind'], title: string, description?: string) => {
    setFeedback({ id: Date.now(), kind, title, description })
  }, [])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 4500)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const reportError = useCallback(
    (fallback: string, error: unknown) => {
      const message = error instanceof Error ? error.message : fallback
      setLastError(message)
      notify('error', fallback, message)
    },
    [notify]
  )

  const runReinterpret = useCallback(async () => {
    if (isReinterpretingRef.current) {
      reinterpretPendingRef.current = true
      return
    }

    isReinterpretingRef.current = true
    setIsInterpreting(true)
    try {
      const result = await api.consultations.reinterpret(consultation.id)
      const { extracted } = result
      if (extracted && Object.keys(extracted).length > 0) {
        mergeExtracted(extracted)
      }
      if (result.suggestions) setSuggestions(result.suggestions)
      if (result.fieldMeta) setFieldMeta(result.fieldMeta)
      if (result.templateId) setTemplateId(result.templateId)
      setLastError(null)
    } catch (err) {
      reportError('Não foi possível reinterpretar a conversa', err)
    } finally {
      isReinterpretingRef.current = false
      setIsInterpreting(false)
      if (reinterpretPendingRef.current) {
        reinterpretPendingRef.current = false
        void runReinterpret()
      }
    }
  }, [consultation.id, mergeExtracted, reportError])

  const handleTranscriptCompleted = useCallback(
    async (text: string, itemId: string, payload?: Record<string, unknown>) => {
      const persist = async () => {
        try {
          const result = await api.consultations.appendRealtimeTranscript(consultation.id, {
            itemId,
            text,
            payload,
          })
          if (!result.appendedText) return

          addTranscript(result.appendedText)
          segmentsSinceReinterpret.current += 1

          if (segmentsSinceReinterpret.current >= REINTERPRET_EVERY) {
            segmentsSinceReinterpret.current = 0
            void runReinterpret()
          }
          setLastError(null)
        } catch (err) {
          reportError('Não foi possível salvar a transcrição em tempo real', err)
        }
      }

      persistQueueRef.current = persistQueueRef.current.then(persist, persist)
      await persistQueueRef.current
    },
    [addTranscript, consultation.id, reportError, runReinterpret]
  )

  const handleStop = useCallback(
    async (fullBlob: Blob) => {
      try {
        await api.consultations.saveAudio(consultation.id, fullBlob)
        await runReinterpret()
      } catch (err) {
        reportError('Não foi possível salvar o áudio da consulta', err)
      }
    },
    [consultation.id, reportError, runReinterpret]
  )

  const { state: recordingState, liveTranscript, startRecording, stopRecording } = useRealtimeTranscription({
    consultationId: consultation.id,
    commitIntervalMs: 8000,
    onTranscriptCompleted: handleTranscriptCompleted,
    onStop: handleStop,
  })

  const displayTranscript = liveTranscript
    ? [transcript, liveTranscript].filter(Boolean).join('\n')
    : transcript

  const handleStartRecording = useCallback(() => {
    void startRecording()
      .then(() => {
        setLastError(null)
        notify('success', 'Gravação iniciada', 'A transcrição em tempo real está ativa.')
      })
      .catch((err) => reportError('Não foi possível iniciar a sessão realtime', err))
  }, [notify, reportError, startRecording])

  const handleStopRecording = useCallback(() => {
    void stopRecording()
      .then(() => notify('info', 'Gravação encerrada', 'O áudio será salvo e a conversa reinterpretada.'))
      .catch((err) => reportError('Não foi possível encerrar a sessão realtime', err))
  }, [notify, reportError, stopRecording])

  const isWaiting = data.status === 'em_espera' || data.status === 'scheduled'
  const isInProgress = data.status === 'em_consulta' || data.status === 'active'

  const handleStart = useCallback(async () => {
    if (isStarting) return

    setIsStarting(true)
    try {
      const updated = await api.consultations.start(consultation.id)
      applyConsultation(updated)
      setLastError(null)
      notify('success', 'Consulta iniciada', 'A gravação já pode ser acionada.')
    } catch (err) {
      reportError('Não foi possível iniciar a consulta', err)
    } finally {
      setIsStarting(false)
    }
  }, [applyConsultation, consultation.id, isStarting, notify, reportError])

  const handleFinalize = useCallback(async () => {
    if (isGeneratingSoap || recordingState !== 'idle') return

    setIsGeneratingSoap(true)
    try {
      const result = await api.consultations.finalize(consultation.id)
      if (result.extracted && Object.keys(result.extracted).length > 0) {
        mergeExtracted(result.extracted)
      }

      if (result.suggestions) setSuggestions(result.suggestions)
      if (result.fieldMeta) setFieldMeta(result.fieldMeta)
      if (result.templateId) setTemplateId(result.templateId)

      if (result.turns?.length) {
        updateField('transcriptStructured', JSON.stringify(result.turns))
      }

      applySoap(result.soap)
      setLastError(null)
      notify('success', 'SOAP gerado', 'Revise a evolução clínica antes de encerrar.')
    } catch (err) {
      reportError('Não foi possível gerar o SOAP', err)
    } finally {
      setIsGeneratingSoap(false)
    }
  }, [
    applySoap,
    consultation.id,
    isGeneratingSoap,
    mergeExtracted,
    notify,
    recordingState,
    reportError,
    updateField,
  ])

  const handleManualSave = useCallback(async () => {
    try {
      await saveConsultation()
      setLastError(null)
      notify('success', 'Consulta salva', 'As alterações do prontuário foram persistidas.')
    } catch (err) {
      reportError('Não foi possível salvar a consulta', err)
    }
  }, [notify, reportError, saveConsultation])

  const handleSuggestionAction = useCallback(
    async (suggestion: ClinicalSuggestion, action: 'accept' | 'dismiss') => {
      try {
        if (action === 'accept' && suggestion.field && suggestion.proposedValue) {
          updateField(
            suggestion.field as keyof Consultation,
            suggestionValue(suggestion.field, suggestion.proposedValue)
          )
        }

        const result = await api.consultations.updateAiState(consultation.id, {
          action,
          suggestionId: suggestion.id,
          field: suggestion.field,
        })
        setSuggestions(result.suggestions)
        setFieldMeta(result.fieldMeta)
        notify(action === 'accept' ? 'success' : 'info', action === 'accept' ? 'Sugestao aplicada' : 'Sugestao descartada')
      } catch (err) {
        reportError('Nao foi possivel registrar a revisao da sugestao', err)
      }
    },
    [consultation.id, notify, reportError, updateField]
  )

  const handleTemplateChange = useCallback(
    async (nextTemplateId: ClinicalTemplateId) => {
      try {
        const result = await api.consultations.updateAiState(consultation.id, { templateId: nextTemplateId })
        setTemplateId(result.templateId)
        setSuggestions(result.suggestions)
        setFieldMeta(result.fieldMeta)
        notify('info', 'Template clinico atualizado', 'A IA vai revisar a conversa no novo contexto clinico.')
        void runReinterpret()
      } catch (err) {
        reportError('Nao foi possivel atualizar o template clinico', err)
      }
    },
    [consultation.id, notify, reportError, runReinterpret]
  )

  const confirmClose = useCallback(async () => {
    setIsClosing(true)
    try {
      await saveConsultation()
      await api.consultations.close(consultation.id)
      notify('success', 'Consulta encerrada')
      router.push(data.patient ? `/patients/${data.patient.id}` : '/patients')
    } catch (err) {
      reportError('Não foi possível encerrar a consulta', err)
      setIsClosing(false)
      setConfirmCloseOpen(false)
    }
  }, [consultation.id, data.patient, notify, reportError, router, saveConsultation])

  const handleCopyText = useCallback(
    (label: string, text: string) => {
      if (!text.trim()) {
        notify('error', `${label} indisponível`, 'Ainda não há conteúdo para copiar.')
        return
      }

      void navigator.clipboard
        .writeText(text)
        .then(() => notify('success', `${label} copiado`))
        .catch((err) => reportError(`Não foi possível copiar ${label.toLowerCase()}`, err))
    },
    [notify, reportError]
  )

  const handlePrintSoap = useCallback(() => {
    const text = soapText(data)
    if (!text.trim()) {
      notify('error', 'SOAP indisponível', 'Gere ou preencha a evolução antes de imprimir.')
      return
    }

    const printWindow = window.open('', '_blank', 'width=900,height=700')
    if (!printWindow) {
      notify('error', 'Impressão bloqueada', 'Permita pop-ups para imprimir a evolução clínica.')
      return
    }

    printWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>SOAP - ${escapeHtml(data.patient?.name || 'Paciente')}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
            pre { white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.55; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>Evolução clínica - SOAP</h1>
          <div class="meta">${escapeHtml(data.patient?.name || 'Paciente')} · ${new Date().toLocaleString('pt-BR')}</div>
          <pre>${escapeHtml(text)}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }, [data, notify])

  const tabContent = {
    anamnese: <AnamneseTab data={data} onChange={updateField} />,
    antecedentes: <AntecedentesTab data={data} onChange={updateField} />,
    habitos: <HabitosTab data={data} onChange={updateField} />,
    revisao_sistemas: <RevisaoSistemasTab data={data} onChange={updateField} />,
    exame_fisico: <ExameFisicoTab data={data} onChange={updateField} />,
    diagnostico: <DiagnosticoTab data={data} onChange={updateField} />,
    conduta: <CondustaTab data={data} onChange={updateField} />,
    soap: <SoapTab data={data} onChange={updateField} />,
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-100">
      <FeedbackToast message={feedback} onClose={() => setFeedback(null)} />

      <ConfirmDialog
        open={confirmCloseOpen}
        title="Encerrar consulta?"
        description="Os dados serão salvos e a consulta será marcada como concluída. Pare a gravação antes de encerrar."
        confirmLabel="Encerrar consulta"
        loading={isClosing}
        onClose={() => setConfirmCloseOpen(false)}
        onConfirm={confirmClose}
      />

      <ConsultationHeader
        consultation={data}
        isSaving={isSaving}
        isGeneratingSoap={isGeneratingSoap}
        isClosing={isClosing}
        isStarting={isStarting}
        isAutoSaving={isAutoSaving}
        lastSavedAt={lastSavedAt}
        recordingState={recordingState}
        onSave={handleManualSave}
        onStart={handleStart}
        onFinalize={handleFinalize}
        onClose={() => setConfirmCloseOpen(true)}
        onOpenConversation={() => setShowConversation(true)}
      />

      {showConversation ? (
        <ConversationModal
          consultation={data}
          onClose={() => setShowConversation(false)}
          onVersionCreated={(updated) => {
            applyConsultation(updated)
            notify('success', 'Nova versão criada', 'A transcrição editada foi recalculada pela IA.')
          }}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <TabSidebar activeTab={activeTab} tabStatuses={tabStatuses} onTabChange={setActiveTab} />

        <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
          <main className="min-h-0 flex-1 overflow-y-auto bg-slate-100">
            <div className="mx-auto w-full max-w-5xl animate-fade-in px-5 py-5 lg:px-7 lg:py-6">
              {isWaiting ? (
                <div className="mb-5 flex flex-col gap-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
                  <div>
                  <p className="text-sm font-semibold text-amber-900">Consulta em espera</p>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-amber-800">
                    O prontuário está reservado, mas a sessão ainda não foi iniciada. Isso evita chamadas
                    duplicadas e garante apenas uma consulta em andamento por médico.
                  </p>
                  </div>
                  <button type="button" onClick={handleStart} disabled={isStarting} className="btn-primary shrink-0">
                    {isStarting ? 'Iniciando...' : 'Iniciar consulta agora'}
                  </button>
                </div>
              ) : null}
              {tabContent[activeTab]}
            </div>
          </main>

          <MedicalToolsPanel
            consultation={data}
            tabStatuses={tabStatuses}
            recordingState={recordingState}
            isInterpreting={isInterpreting}
            isGeneratingSoap={isGeneratingSoap}
            lastError={lastError}
            templateId={templateId}
            suggestions={suggestions}
            fieldMeta={fieldMeta}
            onSelectTab={setActiveTab}
            onTemplateChange={handleTemplateChange}
            onAcceptSuggestion={(suggestion) => void handleSuggestionAction(suggestion, 'accept')}
            onDismissSuggestion={(suggestion) => void handleSuggestionAction(suggestion, 'dismiss')}
            onOpenConversation={() => setShowConversation(true)}
            onGenerateSoap={handleFinalize}
            onCopyText={handleCopyText}
            onPrintSoap={handlePrintSoap}
          />
        </div>
      </div>

      {isInProgress ? (
        <RecordingBar
          recordingState={recordingState}
          transcript={displayTranscript}
          isInterpreting={isInterpreting}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      ) : null}
    </div>
  )
}
