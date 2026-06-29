'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Consultation, TranscriptionEvent } from '@/types'
import { useConsultation } from '@/hooks/useConsultation'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { api } from '@/services/api'
import { ConsultationHeader } from './ConsultationHeader'
import { TabSidebar } from './TabSidebar'
import { RecordingBar } from './RecordingBar'
import { ConversationModal } from './ConversationModal'
import { AnamneseTab } from './tabs/AnamneseTab'
import { AntecedentesTab } from './tabs/AntecedentesTab'
import { HabitosTab } from './tabs/HabitosTab'
import { RevisaoSistemasTab } from './tabs/RevisaoSistemasTab'
import { ExameFisicoTab } from './tabs/ExameFisicoTab'
import { DiagnosticoTab } from './tabs/DiagnosticoTab'
import { CondustaTab } from './tabs/CondustaTab'
import { SoapTab } from './tabs/SoapTab'

interface Props {
  consultation: Consultation
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
    applyTranscript,
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
  const [uploadPendingChunks, setUploadPendingChunks] = useState(0)
  const [serverPendingChunks, setServerPendingChunks] = useState(0)
  const [transcriptionStatus, setTranscriptionStatus] = useState('Pronto para gravar')
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)

  const REINTERPRET_INTERVAL_MS = 90000
  const isReinterpretingRef = useRef(false)
  const lastReinterpretAtRef = useRef(0)
  const eventsRef = useRef<EventSource | null>(null)

  // Relê toda a transcrição acumulada e redistribui nos campos certos
  const runReinterpret = useCallback(async () => {
    if (isReinterpretingRef.current) return // evita chamadas concorrentes
    isReinterpretingRef.current = true
    setIsInterpreting(true)
    try {
      const { extracted } = await api.consultations.reinterpret(consultation.id)
      if (extracted && Object.keys(extracted).length > 0) mergeExtracted(extracted)
      lastReinterpretAtRef.current = Date.now()
    } catch (err) {
      console.error('Erro ao reinterpretar:', err)
    } finally {
      isReinterpretingRef.current = false
      setIsInterpreting(false)
    }
  }, [consultation.id, mergeExtracted])

  const maybeRunReinterpret = useCallback(() => {
    const now = Date.now()
    if (now - lastReinterpretAtRef.current < REINTERPRET_INTERVAL_MS) return
    lastReinterpretAtRef.current = now
    void runReinterpret()
  }, [runReinterpret])

  const handleTranscriptionEvent = useCallback(
    (event: TranscriptionEvent) => {
      if (event.type === 'connected') {
        setTranscriptionStatus('Conectado para transcricao ao vivo')
        return
      }

      if (event.type === 'chunk_queued') {
        setServerPendingChunks((value) => value + 1)
        setTranscriptionStatus('Audio recebido, aguardando transcricao')
        return
      }

      if (event.type === 'chunk_processing') {
        setTranscriptionStatus('Transcrevendo trecho de audio')
        return
      }

      if (event.type === 'transcript_done') {
        setServerPendingChunks((value) => Math.max(0, value - 1))
        setTranscriptionError(null)
        setTranscriptionStatus(event.text ? 'Transcricao atualizada' : 'Trecho sem fala detectavel')
        if (typeof event.fullTranscript === 'string') applyTranscript(event.fullTranscript)
        if (event.text) maybeRunReinterpret()
        return
      }

      if (event.type === 'chunk_error') {
        setServerPendingChunks((value) => Math.max(0, value - 1))
        setTranscriptionError(event.error || 'Falha ao transcrever trecho')
        setTranscriptionStatus('Falha em um trecho, gravacao continua')
        if (typeof event.fullTranscript === 'string') applyTranscript(event.fullTranscript)
        return
      }

      if (event.type === 'queue_idle') {
        setTranscriptionStatus('Transcricao em dia')
      }
    },
    [applyTranscript, maybeRunReinterpret]
  )

  const openTranscriptionEvents = useCallback(() => {
    if (eventsRef.current) return
    const source = new EventSource(api.consultations.transcriptionEventsUrl(consultation.id), {
      withCredentials: true,
    })

    const eventTypes = [
      'connected',
      'chunk_queued',
      'chunk_processing',
      'transcript_done',
      'chunk_error',
      'queue_idle',
    ]

    eventTypes.forEach((type) => {
      source.addEventListener(type, (message) => {
        try {
          handleTranscriptionEvent(JSON.parse(message.data) as TranscriptionEvent)
        } catch (err) {
          console.error('Evento de transcricao invalido:', err)
        }
      })
    })

    source.onerror = () => {
      setTranscriptionStatus('Reconectando transcricao ao vivo')
    }

    eventsRef.current = source
  }, [consultation.id, handleTranscriptionEvent])

  const closeTranscriptionEvents = useCallback(() => {
    eventsRef.current?.close()
    eventsRef.current = null
  }, [])

  useEffect(() => {
    return () => closeTranscriptionEvents()
  }, [closeTranscriptionEvents])

  const handleChunk = useCallback(
    async (blob: Blob, meta: { seq: number; startedAtMs: number; endedAtMs: number }) => {
      try {
        const result = await api.consultations.transcribeChunk(consultation.id, blob, meta)
        // Fallback para chamadas sincronas quando o SSE nao estiver conectado
        if (!result.queued && result.chunkTranscript) {
          addTranscript(result.chunkTranscript)
          maybeRunReinterpret()
        }
      } catch (err) {
        console.error('Erro ao transcrever chunk:', err)
        setTranscriptionError(err instanceof Error ? err.message : 'Erro ao enviar trecho de audio')
      }
    },
    [consultation.id, addTranscript, maybeRunReinterpret]
  )

  const handleStop = useCallback(
    async (fullBlob: Blob) => {
      try {
        await api.consultations.saveAudio(consultation.id, fullBlob)
        const flushed = await api.consultations.flushTranscription(consultation.id)
        if (typeof flushed.fullTranscript === 'string') applyTranscript(flushed.fullTranscript)
        // Re-interpretação final garante que tudo foi consolidado
        await runReinterpret()
      } catch (err) {
        console.error('Erro ao salvar áudio:', err)
      }
    },
    [applyTranscript, consultation.id, runReinterpret]
  )

  const { state: recordingState, startRecording, stopRecording } = useAudioRecorder({
    chunkIntervalMs: 3000,
    onChunk: handleChunk,
    onStop: handleStop,
    onQueueChange: setUploadPendingChunks,
  })

  const handleStartRecording = useCallback(async () => {
    setTranscriptionError(null)
    setTranscriptionStatus('Preparando transcricao ao vivo')
    openTranscriptionEvents()
    await startRecording()
  }, [openTranscriptionEvents, startRecording])

  const handleStopRecording = useCallback(async () => {
    await stopRecording()
    closeTranscriptionEvents()
    setServerPendingChunks(0)
    setUploadPendingChunks(0)
    setTranscriptionStatus('Gravacao encerrada')
  }, [closeTranscriptionEvents, stopRecording])

  const isWaiting = data.status === 'em_espera' || data.status === 'scheduled'
  const isInProgress = data.status === 'em_consulta' || data.status === 'active'

  const handleStart = useCallback(async () => {
    if (isStarting) return
    setIsStarting(true)
    try {
      const updated = await api.consultations.start(consultation.id)
      applyConsultation(updated)
    } catch (err) {
      console.error('Erro ao iniciar consulta:', err)
      alert(err instanceof Error ? err.message : 'Nao foi possivel iniciar a consulta')
    } finally {
      setIsStarting(false)
    }
  }, [applyConsultation, consultation.id, isStarting])

  const handleFinalize = useCallback(async () => {
    setIsGeneratingSoap(true)
    try {
      const result = await api.consultations.finalize(consultation.id)
      // Revisão final corrige os campos do PEP com a análise apurada...
      if (result.extracted && Object.keys(result.extracted).length > 0) {
        mergeExtracted(result.extracted)
      }
      // ...guarda o diálogo estruturado (Médico/Paciente)...
      if (result.turns?.length) {
        updateField('transcriptStructured', JSON.stringify(result.turns))
      }
      // ...e aplica o SOAP
      applySoap(result.soap)
    } catch (err) {
      console.error('Erro na revisão final:', err)
    } finally {
      setIsGeneratingSoap(false)
    }
  }, [consultation.id, applySoap, mergeExtracted, updateField])

  const handleClose = useCallback(async () => {
    if (!confirm('Encerrar esta consulta? Os dados serão salvos e a consulta marcada como concluída.')) return
    setIsClosing(true)
    try {
      await saveConsultation()
      await api.consultations.close(consultation.id)
      router.push(data.patient ? `/patients/${data.patient.id}` : '/patients')
    } catch (err) {
      console.error('Erro ao encerrar consulta:', err)
      setIsClosing(false)
    }
  }, [consultation.id, saveConsultation, data.patient, router])

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
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      <ConsultationHeader
        consultation={data}
        isSaving={isSaving}
        isGeneratingSoap={isGeneratingSoap}
        isClosing={isClosing}
        isStarting={isStarting}
        isAutoSaving={isAutoSaving}
        lastSavedAt={lastSavedAt}
        recordingState={recordingState}
        onSave={saveConsultation}
        onStart={handleStart}
        onFinalize={handleFinalize}
        onClose={handleClose}
        onOpenConversation={() => setShowConversation(true)}
      />

      {showConversation && (
        <ConversationModal
          consultation={data}
          onClose={() => setShowConversation(false)}
          onVersionCreated={(updated) => applyConsultation(updated)}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <TabSidebar
          activeTab={activeTab}
          tabStatuses={tabStatuses}
          onTabChange={setActiveTab}
        />

        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: isInProgress && recordingState !== 'idle' ? '220px' : '80px' }}
        >
          <div className="p-6 max-w-3xl mx-auto animate-fade-in">
            {isWaiting && (
              <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-sm font-semibold text-amber-800">Consulta em espera</p>
                <p className="text-sm text-amber-700 mt-1">
                  O prontuario esta reservado, mas a sessao ainda nao foi iniciada. Isso evita chamadas duplicadas e garante apenas uma consulta em andamento por medico.
                </p>
                <button onClick={handleStart} disabled={isStarting} className="btn-primary mt-4">
                  {isStarting ? 'Iniciando...' : 'Iniciar consulta agora'}
                </button>
              </div>
            )}
            {tabContent[activeTab]}
          </div>
        </div>
      </div>

      {isInProgress && (
        <RecordingBar
          recordingState={recordingState}
          transcript={transcript}
          isInterpreting={isInterpreting}
          pendingChunks={uploadPendingChunks + serverPendingChunks}
          transcriptionStatus={transcriptionStatus}
          transcriptionError={transcriptionError}
          onStart={handleStartRecording}
          onStop={handleStopRecording}
        />
      )}
    </div>
  )
}
