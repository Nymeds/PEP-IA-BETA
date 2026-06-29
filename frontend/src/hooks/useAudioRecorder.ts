'use client'
import { useRef, useState, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'processing'

interface UseAudioRecorderOptions {
  chunkIntervalMs?: number
  onChunk: (blob: Blob, meta: { seq: number; startedAtMs: number; endedAtMs: number }) => Promise<void>
  onStop?: (fullBlob: Blob) => Promise<void>
  onQueueChange?: (pending: number) => void
}

export function useAudioRecorder({
  chunkIntervalMs = 5000,
  onChunk,
  onStop,
  onQueueChange,
}: UseAudioRecorderOptions) {
  const [state, setState] = useState<RecordingState>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const allChunksRef = useRef<Blob[]>([])
  const recorderRef = useRef<MediaRecorder | null>(null)
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve())
  const pendingUploadsRef = useRef(0)
  const seqRef = useRef(0)
  const startedAtRef = useRef(0)

  const setPendingUploads = useCallback(
    (updater: (value: number) => number) => {
      pendingUploadsRef.current = Math.max(0, updater(pendingUploadsRef.current))
      onQueueChange?.(pendingUploadsRef.current)
    },
    [onQueueChange]
  )

  const enqueueUpload = useCallback(
    (blob: Blob) => {
      const seq = seqRef.current + 1
      seqRef.current = seq
      const endedAtMs = Math.round(performance.now() - startedAtRef.current)
      const startedAtMs = Math.max(0, endedAtMs - chunkIntervalMs)

      setPendingUploads((value) => value + 1)
      uploadChainRef.current = uploadChainRef.current
        .catch(() => {})
        .then(() => onChunk(blob, { seq, startedAtMs, endedAtMs }))
        .catch((err) => {
          console.error('Erro ao enviar trecho de audio:', err)
        })
        .finally(() => {
          setPendingUploads((value) => value - 1)
        })
    },
    [chunkIntervalMs, onChunk, setPendingUploads]
  )

  const createRecorder = useCallback(() => {
    if (!streamRef.current) return null

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(streamRef.current, { mimeType })

    recorder.ondataavailable = (e) => {
      if (e.data.size <= 500) return
      allChunksRef.current.push(e.data)
      enqueueUpload(e.data)
    }

    return recorder
  }, [enqueueUpload])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      streamRef.current = stream
      allChunksRef.current = []
      uploadChainRef.current = Promise.resolve()
      pendingUploadsRef.current = 0
      seqRef.current = 0
      startedAtRef.current = performance.now()
      onQueueChange?.(0)

      const recorder = createRecorder()
      if (!recorder) throw new Error('Nao foi possivel iniciar o gravador')
      recorderRef.current = recorder

      setState('recording')
      recorder.start(chunkIntervalMs)
    } catch (err) {
      console.error('Erro ao acessar microfone:', err)
      throw err
    }
  }, [chunkIntervalMs, createRecorder, onQueueChange])

  const stopRecording = useCallback(async () => {
    setState('processing')

    const recorder = recorderRef.current
    if (recorder?.state === 'recording') {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
        recorder.stop()
      })
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    await uploadChainRef.current.catch(() => {})

    if (onStop && allChunksRef.current.length > 0) {
      const fullBlob = new Blob(allChunksRef.current, { type: 'audio/webm' })
      await onStop(fullBlob)
    }

    setState('idle')
  }, [onStop])

  return { state, startRecording, stopRecording }
}
