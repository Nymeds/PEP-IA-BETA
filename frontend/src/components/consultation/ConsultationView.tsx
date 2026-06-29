'use client'
import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Consultation } from '@/types'
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

  // Conta chunks recebidos para disparar a re-interpretação a cada N
  const chunksSinceReinterpret = useRef(0)
  const REINTERPRET_EVERY = 3 // a cada 3 chunks (~24s) relê tudo e consolida
  const isReinterpretingRef = useRef(false)

  // Relê toda a transcrição acumulada e redistribui nos campos certos
  const runReinterpret = useCallback(async () => {
    if (isReinterpretingRef.current) return // evita chamadas concorrentes
    isReinterpretingRef.current = true
    setIsInterpreting(true)
    try {
      const { extracted } = await api.consultations.reinterpret(consultation.id)
      if (extracted && Object.keys(extracted).length > 0) mergeExtracted(extracted)
    } catch (err) {
      console.error('Erro ao reinterpretar:', err)
    } finally {
      isReinterpretingRef.current = false
      setIsInterpreting(false)
    }
  }, [consultation.id, mergeExtracted])

  const handleChunk = useCallback(
    async (blob: Blob) => {
      try {
        const result = await api.consultations.transcribeChunk(consultation.id, blob)
        // Só adiciona à tela se sobrou texto após o filtro de alucinação
        if (result.chunkTranscript) {
          addTranscript(result.chunkTranscript)
          chunksSinceReinterpret.current += 1
          if (chunksSinceReinterpret.current >= REINTERPRET_EVERY) {
            chunksSinceReinterpret.current = 0
            void runReinterpret()
          }
        }
      } catch (err) {
        console.error('Erro ao transcrever chunk:', err)
      }
    },
    [consultation.id, addTranscript, runReinterpret]
  )

  const handleStop = useCallback(
    async (fullBlob: Blob) => {
      try {
        await api.consultations.saveAudio(consultation.id, fullBlob)
        // Re-interpretação final garante que tudo foi consolidado
        await runReinterpret()
      } catch (err) {
        console.error('Erro ao salvar áudio:', err)
      }
    },
    [consultation.id, runReinterpret]
  )

  const { state: recordingState, startRecording, stopRecording } = useAudioRecorder({
    chunkIntervalMs: 8000,
    onChunk: handleChunk,
    onStop: handleStop,
  })

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
          onStart={startRecording}
          onStop={stopRecording}
        />
      )}
    </div>
  )
}
