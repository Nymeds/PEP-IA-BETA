'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Consultation, ExtractedData, FieldProvenance, TabId, TabStatus } from '@/types'
import { api } from '@/services/api'

type TabStatuses = Record<TabId, TabStatus>

interface LocalConsultationDraft {
  consultation: Consultation
  transcript: string
  savedAt: number
}

const TAB_ORDER: TabId[] = [
  'anamnese',
  'antecedentes',
  'habitos',
  'revisao_sistemas',
  'exame_fisico',
  'diagnostico',
  'conduta',
  'soap',
]

const SECTION_TO_TAB: Record<string, TabId> = {
  anamnese: 'anamnese',
  antecedentes: 'antecedentes',
  habitos: 'habitos',
  habitos_vida: 'habitos',
  revisao_sistemas: 'revisao_sistemas',
  revisao: 'revisao_sistemas',
  exame_fisico: 'exame_fisico',
  diagnostico: 'diagnostico',
  conduta: 'conduta',
}

// Campos de cada aba — usados para decidir se a aba já tem conteúdo salvo
const TAB_FIELDS: Record<TabId, (keyof Consultation)[]> = {
  anamnese: ['chiefComplaint', 'hda', 'symptomStart', 'symptomIntensity', 'symptoms', 'improvingFactors', 'worseningFactors'],
  antecedentes: ['previousDiseases', 'surgeries', 'hospitalizations', 'allergiesDetails', 'currentMedications', 'familyHistory'],
  habitos: ['smoking', 'alcohol', 'physicalActivity', 'sleep', 'diet', 'drugs', 'occupation'],
  revisao_sistemas: ['systemsReview'],
  exame_fisico: ['vitalSigns', 'weight', 'height', 'bmi', 'generalState', 'physicalExam'],
  diagnostico: ['mainHypothesis', 'differentials', 'confirmedDiagnosis', 'cid'],
  conduta: ['therapeuticPlan', 'orientations', 'referrals', 'followUpDate'],
  soap: ['subjective', 'objective', 'assessment', 'plan'],
}

// Considera "com conteúdo" valores não vazios (ignora "", "{}", "[]", "null")
function hasContent(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'number') return true
  if (typeof v === 'string') {
    const t = v.trim()
    return t !== '' && t !== '{}' && t !== '[]' && t !== 'null'
  }
  return false
}

function computeInitialStatuses(c: Consultation): TabStatuses {
  const status = {} as TabStatuses
  for (const tab of Object.keys(TAB_FIELDS) as TabId[]) {
    const filled = TAB_FIELDS[tab].some((f) => hasContent(c[f]))
    status[tab] = filled ? 'complete' : 'idle'
  }
  return status
}

export function useConsultation(initialConsultation: Consultation) {
  const draftStorageKey = `pep-consultation-draft:${initialConsultation.id}`
  const [consultation, setConsultation] = useState<Consultation>(initialConsultation)
  const [transcript, setTranscript] = useState(initialConsultation.transcript || '')
  const [activeTab, setActiveTab] = useState<TabId>('anamnese')
  // Ao reabrir uma consulta, marca como 'complete' as abas que já têm dados salvos
  const [tabStatuses, setTabStatuses] = useState<TabStatuses>(() =>
    computeInitialStatuses(initialConsultation)
  )
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const [recoverableDraft, setRecoverableDraft] = useState<LocalConsultationDraft | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey)
      if (!raw) return null
      const draft = JSON.parse(raw) as LocalConsultationDraft
      return draft.savedAt > new Date(initialConsultation.updatedAt).getTime() ? draft : null
    } catch {
      return null
    }
  })
  const manuallyEditedFieldsRef = useRef<Set<keyof Consultation>>(new Set())
  const skipNextDraftEffectRef = useRef(false)

  const markTabWriting = useCallback((tabId: TabId) => {
    setTabStatuses((prev) => ({ ...prev, [tabId]: 'writing' }))
    setTimeout(() => {
      setTabStatuses((prev) => ({
        ...prev,
        [tabId]: prev[tabId] === 'writing' ? 'incomplete' : prev[tabId],
      }))
    }, 2500)
  }, [])

  const mergeExtracted = useCallback(
    (extracted: ExtractedData, fieldMeta: Record<string, FieldProvenance> = {}) => {
      setConsultation((prev) => {
        const updates: Partial<Consultation> = {}

        if (extracted.chiefComplaint) updates.chiefComplaint = extracted.chiefComplaint
        if (extracted.hda) updates.hda = extracted.hda
        if (extracted.symptomStart) updates.symptomStart = extracted.symptomStart
        if (extracted.symptomIntensity) updates.symptomIntensity = extracted.symptomIntensity
        if (extracted.symptoms?.length) updates.symptoms = JSON.stringify(extracted.symptoms)
        if (extracted.improvingFactors) updates.improvingFactors = extracted.improvingFactors
        if (extracted.worseningFactors) updates.worseningFactors = extracted.worseningFactors
        if (extracted.previousDiseases?.length)
          updates.previousDiseases = JSON.stringify(extracted.previousDiseases)
        if (extracted.surgeries?.length) updates.surgeries = JSON.stringify(extracted.surgeries)
        if (extracted.hospitalizations?.length)
          updates.hospitalizations = JSON.stringify(extracted.hospitalizations)
        if (extracted.allergiesDetails?.length)
          updates.allergiesDetails = JSON.stringify(extracted.allergiesDetails)
        if (extracted.currentMedications?.length)
          updates.currentMedications = JSON.stringify(extracted.currentMedications)
        if (extracted.familyHistory) updates.familyHistory = JSON.stringify(extracted.familyHistory)
        if (extracted.smoking) updates.smoking = extracted.smoking
        if (extracted.alcohol) updates.alcohol = extracted.alcohol
        if (extracted.physicalActivity) updates.physicalActivity = extracted.physicalActivity
        if (extracted.sleep) updates.sleep = extracted.sleep
        if (extracted.diet) updates.diet = extracted.diet
        if (extracted.occupation) updates.occupation = extracted.occupation
        if (extracted.vitalSigns) updates.vitalSigns = JSON.stringify(extracted.vitalSigns)
        if (typeof extracted.weight === 'number') updates.weight = extracted.weight
        if (typeof extracted.height === 'number') updates.height = extracted.height
        if (extracted.generalState) updates.generalState = extracted.generalState
        if (extracted.physicalExam) updates.physicalExam = JSON.stringify(extracted.physicalExam)
        if (extracted.mainHypothesis) updates.mainHypothesis = extracted.mainHypothesis
        if (extracted.differentials?.length)
          updates.differentials = JSON.stringify(extracted.differentials)
        if (extracted.cid?.length) updates.cid = JSON.stringify(extracted.cid)
        if (extracted.therapeuticPlan) updates.therapeuticPlan = extracted.therapeuticPlan
        if (extracted.orientations) updates.orientations = extracted.orientations
        if (extracted.referrals) updates.referrals = extracted.referrals
        if (extracted.followUpDate) updates.followUpDate = extracted.followUpDate
        if (extracted.systemsReview && Object.keys(extracted.systemsReview).length)
          updates.systemsReview = JSON.stringify(extracted.systemsReview)

        const safeUpdates = Object.fromEntries(
          Object.entries(updates).filter(([field]) => {
            const consultationField = field as keyof Consultation
            if (!hasContent(prev[consultationField])) return true
            if (manuallyEditedFieldsRef.current.has(consultationField)) return false

            const status = fieldMeta[field]?.status
            return status === 'suggested' || status === 'review'
          })
        ) as Partial<Consultation>
        return { ...prev, ...safeUpdates }
      })

      const affectedTabs = new Set<TabId>()
      if (
        extracted.chiefComplaint ||
        extracted.hda ||
        extracted.symptomStart ||
        extracted.symptoms?.length
      )
        affectedTabs.add('anamnese')
      if (
        extracted.previousDiseases?.length ||
        extracted.surgeries?.length ||
        extracted.allergiesDetails?.length ||
        extracted.currentMedications?.length ||
        extracted.familyHistory
      )
        affectedTabs.add('antecedentes')
      if (extracted.smoking || extracted.alcohol || extracted.physicalActivity || extracted.occupation)
        affectedTabs.add('habitos')
      if (extracted.systemsReview && Object.keys(extracted.systemsReview).length)
        affectedTabs.add('revisao_sistemas')
      if (extracted.vitalSigns || extracted.physicalExam || extracted.generalState)
        affectedTabs.add('exame_fisico')
      if (extracted.mainHypothesis || extracted.differentials?.length || extracted.cid?.length)
        affectedTabs.add('diagnostico')
      if (extracted.therapeuticPlan || extracted.orientations || extracted.referrals)
        affectedTabs.add('conduta')

      affectedTabs.forEach((tab) => markTabWriting(tab))

      if (extracted.currentSection) {
        const targetTab = SECTION_TO_TAB[extracted.currentSection]
        if (targetTab) {
          const idx = TAB_ORDER.indexOf(targetTab)
          const currentIdx = TAB_ORDER.indexOf(activeTab)
          if (idx > currentIdx) {
            setActiveTab(targetTab)
          }
        }
      }
    },
    [activeTab, markTabWriting]
  )

  const addTranscript = useCallback((chunk: string) => {
    setTranscript((prev) => (prev ? `${prev}\n${chunk}` : chunk))
  }, [])

  const applySoap = useCallback(
    (soap: { subjective: string; objective: string; assessment: string; plan: string }) => {
      setConsultation((prev) => ({ ...prev, ...soap }))
      setTabStatuses((prev) => ({ ...prev, soap: 'complete' }))
      setActiveTab('soap')
    },
    []
  )

  const saveConsultation = useCallback(async () => {
    setIsSaving(true)
    try {
      const updated = await api.consultations.update(consultation.id, {
        ...consultation,
        transcript,
        manualFields: Array.from(manuallyEditedFieldsRef.current),
      })
      skipNextDraftEffectRef.current = true
      setConsultation(updated)
      setLastSavedAt(new Date())
      setHasPendingChanges(false)
      setAutoSaveError(null)
      window.sessionStorage.removeItem(draftStorageKey)
    } finally {
      setIsSaving(false)
    }
  }, [consultation, draftStorageKey, transcript])

  // ----- AUTOSAVE: persiste no banco automaticamente (debounce) -----
  // Mantém uma referência sempre atualizada do que precisa ser salvo,
  // para o timer disparar sem recriar o efeito a cada tecla.
  const draftRef = useRef({ consultation, transcript })
  draftRef.current = { consultation, transcript }
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  const persistDraft = useCallback(async () => {
    const { consultation: c, transcript: t } = draftRef.current
    setIsAutoSaving(true)
    try {
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await api.consultations.update(c.id, {
            ...c,
            transcript: t,
            manualFields: Array.from(manuallyEditedFieldsRef.current),
          })
          setLastSavedAt(new Date())
          setHasPendingChanges(false)
          setAutoSaveError(null)
          window.sessionStorage.removeItem(draftStorageKey)
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)))
        }
      }
      if (lastError) {
        setAutoSaveError(lastError instanceof Error ? lastError.message : 'Falha ao salvar automaticamente')
      }
    } finally {
      setIsAutoSaving(false)
    }
  }, [draftStorageKey])

  useEffect(() => {
    // Não salva no primeiro render (estado recém-carregado do banco)
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (skipNextDraftEffectRef.current) {
      skipNextDraftEffectRef.current = false
      return
    }
    setHasPendingChanges(true)
    try {
      window.sessionStorage.setItem(draftStorageKey, JSON.stringify({
        consultation,
        transcript,
        savedAt: Date.now(),
      } satisfies LocalConsultationDraft))
    } catch {
      // O autosave remoto continua ativo quando o armazenamento da sessão não está disponível.
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    // Salva 1,5s após a última alteração (campos, transcrição ou extração da IA)
    autoSaveTimer.current = setTimeout(persistDraft, 1500)
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [consultation, draftStorageKey, transcript, persistDraft])

  const updateField = useCallback((field: keyof Consultation, value: unknown) => {
    manuallyEditedFieldsRef.current.add(field)
    setConsultation((prev) => ({ ...prev, [field]: value }))
  }, [])

  // Substitui o estado pela consulta vinda do servidor (ex: após criar nova versão)
  const applyConsultation = useCallback((c: Consultation) => {
    skipNextDraftEffectRef.current = true
    setConsultation((prev) => ({ ...prev, ...c }))
    if (c.transcript !== undefined) setTranscript(c.transcript || '')
  }, [])

  const restoreLocalDraft = useCallback(() => {
    if (!recoverableDraft) return
    setConsultation(recoverableDraft.consultation)
    setTranscript(recoverableDraft.transcript)
    setRecoverableDraft(null)
    setHasPendingChanges(true)
  }, [recoverableDraft])

  const discardLocalDraft = useCallback(() => {
    window.sessionStorage.removeItem(draftStorageKey)
    setRecoverableDraft(null)
  }, [draftStorageKey])

  return {
    consultation,
    transcript,
    activeTab,
    setActiveTab,
    tabStatuses,
    isSaving,
    isAutoSaving,
    lastSavedAt,
    autoSaveError,
    hasPendingChanges,
    recoverableDraft,
    mergeExtracted,
    addTranscript,
    applySoap,
    saveConsultation,
    updateField,
    applyConsultation,
    restoreLocalDraft,
    discardLocalDraft,
    TAB_ORDER,
  }
}
