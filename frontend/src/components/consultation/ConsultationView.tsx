'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClinicalSuggestion, ClinicalTemplateId, Consultation, FieldProvenance, TabId } from '@/types'
import { useConsultation } from '@/hooks/useConsultation'
import { TranscriptionMode, useRealtimeTranscription } from '@/hooks/useRealtimeTranscription'
import { usePersistentState } from '@/hooks/usePersistentState'
import { api } from '@/services/api'
import { ConsultationHeader } from './ConsultationHeader'
import { ConversationModal } from './ConversationModal'
import { MedicalToolsPanel } from './MedicalToolsPanel'
import { RecordingBar } from './RecordingBar'
import { TabSidebar } from './TabSidebar'
import { FieldReviewBar } from './FieldReviewBar'
import { SuggestionReviewDialog } from './SuggestionReviewDialog'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { Button } from '@/components/ui/Button'
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

const AI_TRACKED_FIELDS = new Set([
  'chiefComplaint', 'hda', 'symptomStart', 'symptomIntensity', 'symptoms', 'improvingFactors', 'worseningFactors',
  'previousDiseases', 'surgeries', 'hospitalizations', 'allergiesDetails', 'currentMedications', 'familyHistory',
  'smoking', 'alcohol', 'physicalActivity', 'sleep', 'diet', 'occupation', 'systemsReview', 'vitalSigns', 'weight',
  'height', 'generalState', 'physicalExam', 'mainHypothesis', 'differentials', 'confirmedDiagnosis', 'cid',
  'therapeuticPlan', 'orientations', 'referrals', 'followUpDate',
])

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
    autoSaveError,
    hasPendingChanges,
    recoverableDraft,
    restoreLocalDraft,
    discardLocalDraft,
  } = useConsultation(consultation)

  const router = useRouter()
  const { notify, confirm } = useFeedback()
  const [isGeneratingSoap, setIsGeneratingSoap] = useState(false)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [editingSuggestion, setEditingSuggestion] = useState<ClinicalSuggestion | null>(null)
  const [navigationCollapsed, setNavigationCollapsed] = usePersistentState(`pep-ui:consultation-nav:${consultation.id}`, false)
  const [toolsOpen, setToolsOpen] = usePersistentState(`pep-ui:consultation-tools:${consultation.id}`, true)
  const [persistedTab, setPersistedTab] = usePersistentState<TabId>(`pep-ui:consultation-tab:${consultation.id}`, 'anamnese')
  const [mobileView, setMobileView] = useState<'chart' | 'readiness' | 'tools'>('chart')
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
  const reinterpretForcePendingRef = useRef(false)

  useEffect(() => {
    setActiveTab(persistedTab)
  }, [persistedTab, setActiveTab])

  const selectTab = useCallback((tab: TabId) => {
    setActiveTab(tab)
    setPersistedTab(tab)
    setMobileView('chart')
  }, [setActiveTab, setPersistedTab])

  const reportError = useCallback(
    (fallback: string, error: unknown) => {
      const message = error instanceof Error ? error.message : fallback
      setLastError(message)
      notify('error', fallback, message)
    },
    [notify]
  )

  const runReinterpret = useCallback(async (force = false) => {
    if (isReinterpretingRef.current) {
      reinterpretPendingRef.current = true
      reinterpretForcePendingRef.current = reinterpretForcePendingRef.current || force
      return
    }

    isReinterpretingRef.current = true
    setIsInterpreting(true)
    try {
      const result = await api.consultations.reinterpret(
        consultation.id,
        force ? { force: true } : undefined
      )
      const { extracted } = result
      if (extracted && Object.keys(extracted).length > 0) {
        mergeExtracted(extracted, result.fieldMeta)
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
        const pendingForce = reinterpretForcePendingRef.current
        reinterpretForcePendingRef.current = false
        void runReinterpret(pendingForce)
      }
    }
  }, [consultation.id, mergeExtracted, reportError])

  const handleTranscriptCompleted = useCallback(
    async (text: string, itemId: string, payload?: Record<string, unknown>) => {
      const persist = async () => {
        try {
          // O frontend recebe a fala final do Realtime e o backend a grava
          // como segmento ordenado antes de atualizar o transcript completo.
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
    async (fullBlob: Blob, context: { mode: Exclude<TranscriptionMode, 'none'> }) => {
      try {
        // Sempre preservamos o áudio original. Isso permite auditoria e
        // reprocessamento sem depender exclusivamente da transcrição.
        await api.consultations.saveAudio(consultation.id, fullBlob)
        if (context.mode === 'local') {
          // No modo local, o Whisper é o fallback. O blob completo é enviado
          // somente ao encerrar; useRealtimeTranscription não usa chunks de 5s.
          const result = await api.consultations.transcribeChunk(consultation.id, fullBlob)
          if (result.chunkTranscript) addTranscript(result.chunkTranscript)
        }
        // Depois de acrescentar texto, relê-se a transcrição inteira para
        // consolidar os campos clínicos com o contexto completo.
        await runReinterpret()
      } catch (err) {
        reportError('Não foi possível salvar o áudio da consulta', err)
      }
    },
    [addTranscript, consultation.id, reportError, runReinterpret]
  )

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
    onStop: handleStop,
  })

  useEffect(() => {
    if (connectionError) notify('info', 'Modo de gravação local ativado', connectionError)
  }, [connectionError, notify])

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
        mergeExtracted(result.extracted, result.fieldMeta)
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
    async (suggestion: ClinicalSuggestion, action: 'accept' | 'dismiss', reviewedValue?: string) => {
      try {
        const value = reviewedValue ?? suggestion.proposedValue
        if (action === 'accept' && suggestion.field && value) {
          updateField(
            suggestion.field as keyof Consultation,
            suggestionValue(suggestion.field, value)
          )
        }

        const result = await api.consultations.updateAiState(consultation.id, {
          action,
          suggestionId: suggestion.id,
          field: suggestion.field,
        })
        setSuggestions(result.suggestions)
        setFieldMeta(result.fieldMeta)
        notify(action === 'accept' ? 'success' : 'info', action === 'accept' ? 'Sugestão aplicada' : 'Sugestão descartada')
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
    }
  }, [consultation.id, data.patient, notify, reportError, router, saveConsultation])

  const requestClose = useCallback(async () => {
    const pendingSuggestions = suggestions.filter((item) => item.status === 'open').length
    const pendingSections = Object.values(tabStatuses).filter((status) => status === 'incomplete' || status === 'idle').length
    const accepted = await confirm({
      title: 'Encerrar consulta?',
      description: `${pendingSections} seção(ões) ainda não estão completas e ${pendingSuggestions} sugestão(ões) seguem abertas. O prontuário será salvo antes do encerramento.`,
      confirmLabel: 'Salvar e encerrar',
    })
    if (accepted) await confirmClose()
  }, [confirm, confirmClose, suggestions, tabStatuses])

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

  const handleFieldChange = useCallback((field: keyof Consultation, value: unknown) => {
    updateField(field, value)
    if (!AI_TRACKED_FIELDS.has(String(field))) return
    setFieldMeta((current) => ({
      ...current,
      [field]: current[String(field)]
        ? { ...current[String(field)], status: 'manual' }
        : {
          field: field as FieldProvenance['field'],
          status: 'manual',
          source: 'unknown',
          speaker: 'Indefinido',
          confidence: 'high',
          requiresReview: false,
          evidence: [],
        },
    }))
  }, [updateField])

  const toggleTools = useCallback(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileView((current) => current === 'tools' ? 'chart' : 'tools')
      return
    }
    setToolsOpen((current) => !current)
  }, [setToolsOpen])

  useEffect(() => {
    const tabs: TabId[] = ['anamnese', 'antecedentes', 'habitos', 'revisao_sistemas', 'exame_fisico', 'diagnostico', 'conduta', 'soap']
    const onKeyDown = (event: KeyboardEvent) => {
      const command = event.ctrlKey || event.metaKey
      if (command && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleManualSave()
        return
      }
      if (command && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        toggleTools()
        return
      }
      if (command && event.shiftKey && event.key.toLowerCase() === 'm' && isInProgress) {
        event.preventDefault()
        if (recordingState === 'recording') handleStopRecording()
        else if (recordingState === 'idle') handleStartRecording()
        return
      }
      if (event.altKey && /^[1-8]$/.test(event.key)) {
        event.preventDefault()
        selectTab(tabs[Number(event.key) - 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleManualSave, handleStartRecording, handleStopRecording, isInProgress, recordingState, selectTab, toggleTools])

  const tabContent = {
    anamnese: <AnamneseTab data={data} onChange={handleFieldChange} />,
    antecedentes: <AntecedentesTab data={data} onChange={handleFieldChange} />,
    habitos: <HabitosTab data={data} onChange={handleFieldChange} />,
    revisao_sistemas: <RevisaoSistemasTab data={data} onChange={handleFieldChange} />,
    exame_fisico: <ExameFisicoTab data={data} onChange={handleFieldChange} />,
    diagnostico: <DiagnosticoTab data={data} onChange={handleFieldChange} />,
    conduta: <CondustaTab data={data} onChange={handleFieldChange} />,
    soap: <SoapTab data={data} onChange={handleFieldChange} />,
  }

  const renderTools = (className?: string) => (
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
      onSelectTab={selectTab}
      onReinterpret={() => void runReinterpret(true)}
      onTemplateChange={handleTemplateChange}
      onAcceptSuggestion={(suggestion) => void handleSuggestionAction(suggestion, 'accept')}
      onEditSuggestion={setEditingSuggestion}
      onDismissSuggestion={(suggestion) => void handleSuggestionAction(suggestion, 'dismiss')}
      onOpenConversation={() => setShowConversation(true)}
      onGenerateSoap={handleFinalize}
      onCopyText={handleCopyText}
      onPrintSoap={handlePrintSoap}
      className={className}
    />
  )

  return (
    <div className="consultation-compact flex h-dvh flex-col overflow-hidden bg-slate-100">
      <SuggestionReviewDialog
        suggestion={editingSuggestion}
        onClose={() => setEditingSuggestion(null)}
        onConfirm={(suggestion, value) => {
          setEditingSuggestion(null)
          void handleSuggestionAction(suggestion, 'accept', value)
        }}
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
        hasPendingChanges={hasPendingChanges}
        autoSaveError={autoSaveError}
        toolsOpen={toolsOpen || mobileView === 'tools'}
        onSave={handleManualSave}
        onStart={handleStart}
        onFinalize={handleFinalize}
        onClose={() => void requestClose()}
        onOpenConversation={() => setShowConversation(true)}
        onToggleTools={toggleTools}
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

      <div className="flex border-b border-slate-200 bg-white p-1 md:hidden" role="tablist" aria-label="Área da consulta">
        {([
          ['chart', 'Prontuário'],
          ['readiness', 'Revisão'],
          ['tools', 'Ferramentas'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setMobileView(id)} className={`flex-1 rounded-md px-2 py-2 text-xs font-medium ${mobileView === id ? 'bg-primary-50 text-primary-700' : 'text-slate-500'}`} role="tab" aria-selected={mobileView === id}>{label}</button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={mobileView === 'chart' ? 'contents' : 'hidden md:contents'}>
          <TabSidebar activeTab={activeTab} tabStatuses={tabStatuses} onTabChange={selectTab} collapsed={navigationCollapsed} onToggle={() => setNavigationCollapsed((current) => !current)} />
        </div>

        <main className={`${mobileView === 'chart' ? 'block' : 'hidden'} min-h-0 min-w-0 flex-1 overflow-y-auto bg-slate-100 md:block`}>
          <div className="mx-auto w-full max-w-6xl animate-fade-in px-3 py-3 lg:px-5 lg:py-4">
            {recoverableDraft ? (
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="alert">
                <div><p className="text-sm font-semibold text-blue-900">Rascunho local encontrado</p><p className="mt-0.5 text-xs text-blue-700">Há alterações mais recentes nesta sessão que ainda não chegaram ao servidor.</p></div>
                <div className="flex gap-2"><Button size="sm" onClick={discardLocalDraft}>Descartar</Button><Button size="sm" variant="primary" onClick={restoreLocalDraft}>Recuperar rascunho</Button></div>
              </div>
            ) : null}
            {autoSaveError ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5" role="alert"><p className="text-xs text-red-700">Autosave pendente: {autoSaveError}</p><Button size="sm" onClick={() => void handleManualSave()}>Tentar salvar</Button></div>
            ) : null}
            {isWaiting ? (
              <div className="mb-3 flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold text-amber-900">Consulta em espera</p><p className="mt-0.5 text-xs text-amber-800">Inicie o atendimento para liberar gravação, preenchimento por IA e encerramento.</p></div>
                <Button variant="primary" onClick={handleStart} disabled={isStarting}>{isStarting ? 'Iniciando...' : 'Iniciar consulta'}</Button>
              </div>
            ) : null}
            <FieldReviewBar activeTab={activeTab} fieldMeta={fieldMeta} tabStatus={tabStatuses[activeTab]} />
            {tabContent[activeTab]}
          </div>
        </main>

        <section className={`${mobileView === 'readiness' ? 'block' : 'hidden'} min-h-0 flex-1 overflow-y-auto bg-slate-100 p-3 md:hidden`} role="tabpanel">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-semibold text-slate-950">Revisão antes do SOAP</h2><p className="mt-0.5 text-xs text-slate-500">Abra cada seção pendente antes de finalizar.</p></div>
            <div className="divide-y divide-slate-100">
              {Object.entries(tabStatuses).map(([tab, status]) => <button key={tab} type="button" onClick={() => selectTab(tab as TabId)} className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="text-sm font-medium capitalize text-slate-800">{tab.replaceAll('_', ' ')}</span><span className={`rounded px-2 py-1 text-[11px] ${status === 'complete' ? 'bg-emerald-50 text-emerald-700' : status === 'writing' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{status === 'complete' ? 'Completo' : status === 'writing' ? 'IA preenchendo' : 'Revisar'}</span></button>)}
            </div>
            <div className="border-t border-slate-200 p-4"><p className="mb-3 text-xs text-slate-600">{suggestions.filter((item) => item.status === 'open').length} sugestão(ões) aberta(s).</p><Button variant="primary" className="w-full" onClick={handleFinalize} disabled={isGeneratingSoap || recordingState !== 'idle'}>Gerar SOAP</Button></div>
          </div>
        </section>

        <section className={`${mobileView === 'tools' ? 'block' : 'hidden'} min-h-0 flex-1 overflow-y-auto md:hidden`} role="tabpanel">
          {renderTools('border-0')}
        </section>

        {toolsOpen ? <div className="hidden w-80 shrink-0 overflow-y-auto border-l border-slate-200 xl:block">{renderTools()}</div> : null}

        {toolsOpen ? (
          <div className="fixed inset-0 z-40 hidden md:block xl:hidden">
            <button type="button" className="absolute inset-0 bg-slate-950/35" onClick={() => setToolsOpen(false)} aria-label="Fechar ferramentas médicas" />
            <div className="absolute inset-y-0 right-0 w-[min(360px,92vw)] overflow-y-auto border-l border-slate-200 bg-white shadow-xl">{renderTools()}</div>
          </div>
        ) : null}
      </div>

      {isInProgress ? (
        <RecordingBar
          recordingState={recordingState}
          transcriptionMode={transcriptionMode}
          connectionError={connectionError}
          transcript={displayTranscript}
          isInterpreting={isInterpreting}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      ) : null}
    </div>
  )
}
