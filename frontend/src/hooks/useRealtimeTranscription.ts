'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'

export type RecordingState = 'idle' | 'recording' | 'processing'

interface UseRealtimeTranscriptionOptions {
  consultationId: string
  commitIntervalMs?: number
  onTranscriptCompleted: (
    text: string,
    itemId: string,
    payload?: Record<string, unknown>
  ) => Promise<void>
  onStop?: (fullBlob: Blob) => Promise<void>
}

interface RealtimeEventPayload {
  type?: string
  item_id?: string
  transcript?: string
  delta?: string
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useRealtimeTranscription({
  consultationId,
  commitIntervalMs = 8000,
  onTranscriptCompleted,
  onStop,
}: UseRealtimeTranscriptionOptions) {
  const [state, setState] = useState<RecordingState>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const commitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isStartingRef = useRef(false)
  const audioChunksRef = useRef<Blob[]>([])
  const partialItemsRef = useRef(new Map<string, string>())
  const pendingPersistsRef = useRef(new Set<Promise<void>>())

  const syncLiveTranscript = useCallback(() => {
    const text = Array.from(partialItemsRef.current.values())
      .map((value) => value.trim())
      .filter(Boolean)
      .join('\n')
    setLiveTranscript(text)
  }, [])

  const trackPersist = useCallback((promise: Promise<void>) => {
    pendingPersistsRef.current.add(promise)
    void promise.finally(() => {
      pendingPersistsRef.current.delete(promise)
    })
  }, [])

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current
    if (!channel || channel.readyState !== 'open') return false
    channel.send(JSON.stringify(event))
    return true
  }, [])

  const cleanupRealtimeResources = useCallback(() => {
    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current)
      commitTimerRef.current = null
    }

    dataChannelRef.current?.close()
    dataChannelRef.current = null

    peerConnectionRef.current?.close()
    peerConnectionRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const waitForPendingTranscripts = useCallback(async (timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (partialItemsRef.current.size === 0 && pendingPersistsRef.current.size === 0) {
        return
      }
      await sleep(150)
    }

    if (pendingPersistsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingPersistsRef.current))
    }
  }, [])

  const waitForDataChannelOpen = useCallback((channel: RTCDataChannel) => {
    if (channel.readyState === 'open') return Promise.resolve()

    return new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error('Canal de eventos do Realtime nao abriu a tempo'))
      }, 10000)

      const handleOpen = () => {
        cleanup()
        resolve()
      }

      const handleClose = () => {
        cleanup()
        reject(new Error('Canal de eventos do Realtime fechou antes de abrir'))
      }

      const cleanup = () => {
        window.clearTimeout(timer)
        channel.removeEventListener('open', handleOpen)
        channel.removeEventListener('close', handleClose)
      }

      channel.addEventListener('open', handleOpen)
      channel.addEventListener('close', handleClose)
    })
  }, [])

  const stopLocalRecorder = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current
    recorderRef.current = null

    if (!recorder) return null

    if (recorder.state === 'inactive') {
      if (!audioChunksRef.current.length) return null
      return new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    }

    return new Promise<Blob | null>((resolve) => {
      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop)
        if (!audioChunksRef.current.length) {
          resolve(null)
          return
        }

        resolve(new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }

      recorder.addEventListener('stop', handleStop, { once: true })
      recorder.stop()
    })
  }, [])

  const handleRealtimeMessage = useCallback(
    (event: MessageEvent<string>) => {
      let payload: RealtimeEventPayload
      try {
        payload = JSON.parse(event.data) as RealtimeEventPayload
      } catch {
        return
      }

      const itemId = payload.item_id || crypto.randomUUID()

      if (payload.type === 'conversation.item.input_audio_transcription.delta' && payload.delta) {
        const previous = partialItemsRef.current.get(itemId) || ''
        partialItemsRef.current.set(itemId, `${previous}${payload.delta}`)
        syncLiveTranscript()
        return
      }

      if (payload.type === 'conversation.item.input_audio_transcription.completed') {
        partialItemsRef.current.delete(itemId)
        syncLiveTranscript()

        const text = payload.transcript?.trim()
        if (!text) return

        const persistPromise = Promise.resolve(
          onTranscriptCompleted(text, itemId, payload as Record<string, unknown>)
        ).catch((error) => {
          console.error('Erro ao persistir transcricao realtime:', error)
        })

        trackPersist(persistPromise)
      }
    },
    [onTranscriptCompleted, syncLiveTranscript, trackPersist]
  )

  const startRecording = useCallback(async () => {
    if (state !== 'idle' || isStartingRef.current) return

    isStartingRef.current = true
    audioChunksRef.current = []
    partialItemsRef.current.clear()
    setLiveTranscript('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      recorderRef.current = recorder

      const { value: ephemeralKey } = await api.consultations.createRealtimeToken(consultationId)

      const peerConnection = new RTCPeerConnection()
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'failed') {
          console.error('Conexao Realtime falhou')
        }
      }

      stream.getAudioTracks().forEach((track) => {
        peerConnection.addTrack(track, stream)
      })

      const dataChannel = peerConnection.createDataChannel('oai-events')
      dataChannel.addEventListener('message', handleRealtimeMessage)

      const offer = await peerConnection.createOffer()
      if (!offer.sdp) {
        throw new Error('Nao foi possivel criar a oferta SDP do Realtime')
      }
      await peerConnection.setLocalDescription(offer)

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      })

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text().catch(() => '')
        throw new Error(errorText || 'Falha ao conectar com o Realtime da OpenAI')
      }

      await peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: await sdpResponse.text(),
      })

      await waitForDataChannelOpen(dataChannel)

      recorder.start()
      peerConnectionRef.current = peerConnection
      dataChannelRef.current = dataChannel

      commitTimerRef.current = setInterval(() => {
        sendRealtimeEvent({ type: 'input_audio_buffer.commit' })
      }, commitIntervalMs)

      setState('recording')
    } catch (error) {
      cleanupRealtimeResources()
      const maybeRecorder = recorderRef.current
      recorderRef.current = null
      if (maybeRecorder && maybeRecorder.state !== 'inactive') {
        maybeRecorder.stop()
      }
      setState('idle')
      throw error
    } finally {
      isStartingRef.current = false
    }
  }, [
    cleanupRealtimeResources,
    commitIntervalMs,
    consultationId,
    handleRealtimeMessage,
    sendRealtimeEvent,
    state,
    waitForDataChannelOpen,
  ])

  const stopRecording = useCallback(async () => {
    if (state !== 'recording') return

    setState('processing')

    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current)
      commitTimerRef.current = null
    }

    sendRealtimeEvent({ type: 'input_audio_buffer.commit' })
    await waitForPendingTranscripts(1600)

    const fullBlob = await stopLocalRecorder()
    cleanupRealtimeResources()
    partialItemsRef.current.clear()
    setLiveTranscript('')

    try {
      if (onStop && fullBlob) {
        await onStop(fullBlob)
      }
    } finally {
      setState('idle')
    }
  }, [
    cleanupRealtimeResources,
    onStop,
    sendRealtimeEvent,
    state,
    stopLocalRecorder,
    waitForPendingTranscripts,
  ])

  useEffect(() => {
    return () => {
      void stopLocalRecorder()
      cleanupRealtimeResources()
      recorderRef.current = null
      partialItemsRef.current.clear()
    }
  }, [cleanupRealtimeResources, stopLocalRecorder])

  return {
    state,
    liveTranscript,
    startRecording,
    stopRecording,
  }
}
