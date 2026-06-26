'use client'
import { useRef, useState, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'processing'

interface UseAudioRecorderOptions {
  chunkIntervalMs?: number
  onChunk: (blob: Blob) => Promise<void>
  onStop?: (fullBlob: Blob) => Promise<void>
}

export function useAudioRecorder({
  chunkIntervalMs = 5000,
  onChunk,
  onStop,
}: UseAudioRecorderOptions) {
  const [state, setState] = useState<RecordingState>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const allChunksRef = useRef<Blob[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const pendingChunkRef = useRef<BlobPart[]>([])
  const isSendingRef = useRef(false)

  const startNewSegment = useCallback(() => {
    if (!streamRef.current) return

    pendingChunkRef.current = []
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm',
    })

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        pendingChunkRef.current.push(e.data)
        allChunksRef.current.push(e.data)
      }
    }

    recorder.onstop = async () => {
      if (pendingChunkRef.current.length === 0) return
      const blob = new Blob(pendingChunkRef.current, { type: 'audio/webm' })
      if (blob.size > 500 && !isSendingRef.current) {
        isSendingRef.current = true
        try {
          await onChunk(blob)
        } finally {
          isSendingRef.current = false
        }
      }
    }

    recorder.start()
    recorderRef.current = recorder
  }, [onChunk])

  const stopCurrentSegment = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }, [])

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
      setState('recording')
      startNewSegment()

      intervalRef.current = setInterval(() => {
        stopCurrentSegment()
        startNewSegment()
      }, chunkIntervalMs)
    } catch (err) {
      console.error('Erro ao acessar microfone:', err)
      throw err
    }
  }, [startNewSegment, stopCurrentSegment, chunkIntervalMs])

  const stopRecording = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    stopCurrentSegment()
    setState('processing')

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    if (onStop && allChunksRef.current.length > 0) {
      const fullBlob = new Blob(allChunksRef.current, { type: 'audio/webm' })
      await onStop(fullBlob)
    }

    setState('idle')
  }, [stopCurrentSegment, onStop])

  return { state, startRecording, stopRecording }
}
