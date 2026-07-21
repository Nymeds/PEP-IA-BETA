'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dynamicConsultationApi } from '@/services/dynamic-consultation-api'
import type {
  ClinicalDocumentKind,
  DynamicConsultationRuntime,
} from '@/types/forms'

type LocalDocumentValues = Record<ClinicalDocumentKind, Record<string, unknown>>

interface PendingChange {
  key: string
  sequence: number
  documentKind: ClinicalDocumentKind
  fieldId: string
  value: unknown
  reason?: string
}

function emptyValues(): LocalDocumentValues {
  return { compartilhavel: {}, restrito: {} }
}

function valuesFromRuntime(runtime?: DynamicConsultationRuntime): LocalDocumentValues {
  const values = emptyValues()
  runtime?.documents.forEach((document) => {
    values[document.kind] = Object.fromEntries(
      Object.entries(document.values).map(([fieldId, field]) => [fieldId, field.value])
    )
  })
  return values
}

export function useDynamicConsultation(consultationId: string) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => ['consultation-runtime', consultationId] as const, [consultationId])
  const query = useQuery({
    queryKey,
    queryFn: () => dynamicConsultationApi.runtime(consultationId),
  })
  const response = query.data
  const runtime: DynamicConsultationRuntime | undefined =
    response?.formMode === 'dynamic' ? response : undefined
  const [values, setValues] = useState<LocalDocumentValues>(emptyValues)
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)

  const runtimeRef = useRef<DynamicConsultationRuntime | undefined>(runtime)
  const valuesRef = useRef(values)
  const pendingRef = useRef(new Map<string, PendingChange>())
  const timersRef = useRef(new Map<string, number>())
  const queuesRef = useRef(new Map<string, Promise<void>>())
  const serialQueueRef = useRef<Promise<void>>(Promise.resolve())
  const queuedSequencesRef = useRef(new Map<string, number>())
  const sequenceRef = useRef(0)

  useEffect(() => {
    runtimeRef.current = runtime
    if (!runtime) return
    const serverValues = valuesFromRuntime(runtime)
    pendingRef.current.forEach((pending) => {
      serverValues[pending.documentKind][pending.fieldId] = pending.value
    })
    valuesRef.current = serverValues
    setValues(serverValues)
  }, [runtime])

  const setRuntime = useCallback(
    (nextRuntime: DynamicConsultationRuntime) => {
      runtimeRef.current = nextRuntime
      queryClient.setQueryData(queryKey, nextRuntime)
    },
    [queryClient, queryKey]
  )

  const refetchRuntime = query.refetch

  const persist = useCallback(
    async (change: PendingChange) => {
      const currentRuntime = runtimeRef.current
      if (!currentRuntime) return
      const document = currentRuntime.documents.find(
        (item) => item.kind === change.documentKind
      )
      const expectedRevision = document?.values[change.fieldId]?.revision || 0
      setSaveState('saving')

      try {
        const nextRuntime = await dynamicConsultationApi.updateFields(consultationId, {
          documentKind: change.documentKind,
          changes: [{
            fieldId: change.fieldId,
            value: change.value,
            expectedRevision,
          }],
          reason: change.reason,
        })
        setRuntime(nextRuntime)

        const latest = pendingRef.current.get(change.key)
        if (latest?.sequence === change.sequence) pendingRef.current.delete(change.key)

        const serverValues = valuesFromRuntime(nextRuntime)
        pendingRef.current.forEach((pending) => {
          serverValues[pending.documentKind][pending.fieldId] = pending.value
        })
        valuesRef.current = serverValues
        setValues(serverValues)
        setSaveError(null)
        setLastSavedAt(new Date())
        setSaveState(pendingRef.current.size ? 'pending' : 'saved')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível salvar o campo'
        setSaveError(message)
        setSaveState('error')
        if (error && typeof error === 'object' && 'status' in error && error.status === 409) {
          void refetchRuntime()
        }
        throw error
      }
    },
    [consultationId, refetchRuntime, setRuntime]
  )

  const enqueuePersist = useCallback(
    (change: PendingChange) => {
      if (queuedSequencesRef.current.get(change.key) === change.sequence) {
        return queuesRef.current.get(change.key) || Promise.resolve()
      }
      const previous = serialQueueRef.current
      const job = previous.catch(() => undefined).then(() => persist(change))
      serialQueueRef.current = job
      queuesRef.current.set(change.key, job)
      queuedSequencesRef.current.set(change.key, change.sequence)
      const cleanup = () => {
        if (queuesRef.current.get(change.key) === job) {
          queuesRef.current.delete(change.key)
          queuedSequencesRef.current.delete(change.key)
        }
      }
      void job.then(cleanup, cleanup)
      return job
    },
    [persist]
  )

  const updateField = useCallback(
    (
      documentKind: ClinicalDocumentKind,
      fieldId: string,
      value: unknown,
      options?: { reason?: string; immediate?: boolean }
    ) => {
      const key = `${documentKind}:${fieldId}`
      const sequence = ++sequenceRef.current
      const change: PendingChange = {
        key,
        sequence,
        documentKind,
        fieldId,
        value,
        reason: options?.reason,
      }
      pendingRef.current.set(key, change)

      const nextValues: LocalDocumentValues = {
        compartilhavel: { ...valuesRef.current.compartilhavel },
        restrito: { ...valuesRef.current.restrito },
      }
      nextValues[documentKind][fieldId] = value
      valuesRef.current = nextValues
      setValues(nextValues)
      setSaveError(null)
      setSaveState('pending')

      const previousTimer = timersRef.current.get(key)
      if (previousTimer) window.clearTimeout(previousTimer)
      const delay = options?.immediate ? 0 : 900
      const timer = window.setTimeout(() => {
        timersRef.current.delete(key)
        void enqueuePersist(change).catch(() => undefined)
      }, delay)
      timersRef.current.set(key, timer)
    },
    [enqueuePersist]
  )

  const flushPending = useCallback(async () => {
    const pending = Array.from(pendingRef.current.values())
    timersRef.current.forEach((timer) => window.clearTimeout(timer))
    timersRef.current.clear()
    await Promise.all(pending.map((change) => enqueuePersist(change)))
    await Promise.all(Array.from(queuesRef.current.values()))
  }, [enqueuePersist])

  const retryPending = useCallback(async () => {
    setSaveError(null)
    await flushPending()
  }, [flushPending])

  useEffect(() => {
    const timers = timersRef.current
    const pendingChanges = pendingRef.current
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!pendingChanges.size) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
      Array.from(pendingChanges.values()).forEach((change) => {
        void enqueuePersist(change).catch(() => undefined)
      })
    }
  }, [enqueuePersist])

  return {
    ...query,
    runtime,
    values,
    updateField,
    flushPending,
    retryPending,
    setRuntime,
    saveState,
    saveError,
    lastSavedAt,
    hasPendingChanges: pendingRef.current.size > 0,
  }
}
