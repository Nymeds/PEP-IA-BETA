'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/services/api'

export type RecordingState = 'idle' | 'recording' | 'processing'
export type TranscriptionMode = 'none' | 'realtime' | 'local'

export interface TranscriptCompletionContext {
  source: 'realtime' | 'local'
  alreadyPersisted: boolean
  payload?: Record<string, unknown>
  fullTranscript?: string | null
}

interface UseRealtimeTranscriptionOptions {
  consultationId: string
  commitIntervalMs?: number
  localChunkIntervalMs?: number
  onTranscriptCompleted: (
    text: string,
    itemId: string,
    context: TranscriptCompletionContext
  ) => Promise<void>
  onStop?: (fullBlob: Blob, context: { mode: Exclude<TranscriptionMode, 'none'> }) => Promise<void>
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
  localChunkIntervalMs = 5000,
  onTranscriptCompleted,
  onStop,
}: UseRealtimeTranscriptionOptions) {
  const [state, setState] = useState<RecordingState>('idle')
  const [liveTranscript, setLiveTranscript] = useState('')
  const [mode, setMode] = useState<TranscriptionMode>('none')
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const localChunkRecorderRef = useRef<MediaRecorder | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const commitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const localChunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isStartingRef = useRef(false)
  const audioChunksRef = useRef<Blob[]>([])
  const bufferedLocalChunksRef = useRef<Array<{ blob: Blob; itemId: string }>>([])
  const localChunkQueueRef = useRef<Promise<void>>(Promise.resolve())
  const localChunkDispositionRef = useRef<'buffer' | 'transcribe' | 'discard'>('discard')
  const localChunkSessionRef = useRef(0)
  const localChunkSequenceRef = useRef(0)
  const discardedLocalRecordersRef = useRef(new WeakSet<MediaRecorder>())
  const partialItemsRef = useRef(new Map<string, string>())
  const pendingPersistsRef = useRef(new Set<Promise<void>>())
  const modeRef = useRef<TranscriptionMode>('none')
  const fallbackActivatedRef = useRef(false)
  const sessionAbortRef = useRef<AbortController | null>(null)
  const onStopRef = useRef(onStop)

  useEffect(() => {
    onStopRef.current = onStop
  }, [onStop])

  // O áudio local é mantido mesmo quando o Realtime está funcionando.
  // Ele serve como cópia completa para auditoria e como fallback caso a
  // conexão WebRTC caia durante a consulta.

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

  const enqueueLocalChunk = useCallback((chunk: { blob: Blob; itemId: string }) => {
    const transcribe = async () => {
      const result = await api.consultations.transcribeChunk(consultationId, chunk.blob)
      const text = result.chunkTranscript.trim()
      if (!text) return

      await onTranscriptCompleted(text, chunk.itemId, {
        source: 'local',
        alreadyPersisted: true,
        fullTranscript: result.fullTranscript,
      })
    }

    const next = localChunkQueueRef.current.then(transcribe, transcribe)
    localChunkQueueRef.current = next.catch((error) => {
      console.error('Erro ao transcrever segmento no modo local:', error)
      setConnectionError(
        'Um segmento não pôde ser transcrito incrementalmente. O áudio completo continua preservado.'
      )
    })
  }, [consultationId, onTranscriptCompleted])

  const startLocalChunkRecorder = useCallback(() => {
    const stream = streamRef.current
    if (
      !stream ||
      !recorderRef.current ||
      localChunkRecorderRef.current ||
      localChunkDispositionRef.current === 'discard'
    ) {
      return
    }

    const sessionId = localChunkSessionRef.current

    const startSegment = () => {
      if (
        localChunkSessionRef.current !== sessionId ||
        !recorderRef.current ||
        localChunkRecorderRef.current ||
        localChunkDispositionRef.current === 'discard'
      ) {
        return
      }

      const mimeType = recorderRef.current.mimeType || 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      const parts: Blob[] = []
      localChunkRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) parts.push(event.data)
      }

      const timer = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, localChunkIntervalMs)
      localChunkTimerRef.current = timer

      recorder.onstop = () => {
        clearTimeout(timer)
        if (localChunkTimerRef.current === timer) localChunkTimerRef.current = null
        if (localChunkRecorderRef.current === recorder) localChunkRecorderRef.current = null

        const shouldDiscard = discardedLocalRecordersRef.current.has(recorder)
        discardedLocalRecordersRef.current.delete(recorder)

        if (!shouldDiscard && parts.length > 0) {
          const chunk = {
            blob: new Blob(parts, { type: mimeType }),
            itemId: `local-${sessionId}-${++localChunkSequenceRef.current}`,
          }

          if (localChunkDispositionRef.current === 'buffer') {
            bufferedLocalChunksRef.current.push(chunk)
          } else if (localChunkDispositionRef.current === 'transcribe') {
            enqueueLocalChunk(chunk)
          }
        }

        if (
          localChunkSessionRef.current === sessionId &&
          recorderRef.current &&
          localChunkDispositionRef.current !== 'discard'
        ) {
          void Promise.resolve().then(startSegment)
        }
      }

      recorder.start()
    }

    startSegment()
  }, [enqueueLocalChunk, localChunkIntervalMs])

  const activateLocalChunkTranscription = useCallback(() => {
    fallbackActivatedRef.current = true
    localChunkDispositionRef.current = 'transcribe'

    const buffered = bufferedLocalChunksRef.current.splice(0)
    buffered.forEach(enqueueLocalChunk)
    startLocalChunkRecorder()
  }, [enqueueLocalChunk, startLocalChunkRecorder])

  const discardBufferedLocalChunks = useCallback(() => {
    localChunkDispositionRef.current = 'discard'
    bufferedLocalChunksRef.current = []

    if (localChunkTimerRef.current) {
      clearTimeout(localChunkTimerRef.current)
      localChunkTimerRef.current = null
    }

    const recorder = localChunkRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      discardedLocalRecordersRef.current.add(recorder)
      recorder.stop()
    }
  }, [])

  const stopLocalChunkRecorder = useCallback(async (shouldTranscribe: boolean) => {
    localChunkSessionRef.current += 1
    localChunkDispositionRef.current = shouldTranscribe ? 'transcribe' : 'discard'

    if (shouldTranscribe) {
      const buffered = bufferedLocalChunksRef.current.splice(0)
      buffered.forEach(enqueueLocalChunk)
    } else {
      bufferedLocalChunksRef.current = []
    }

    if (localChunkTimerRef.current) {
      clearTimeout(localChunkTimerRef.current)
      localChunkTimerRef.current = null
    }

    const recorder = localChunkRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      if (!shouldTranscribe) discardedLocalRecordersRef.current.add(recorder)
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.stop()
      })
    } else if (recorder && localChunkRecorderRef.current === recorder) {
      localChunkRecorderRef.current = null
    }

    await localChunkQueueRef.current
  }, [enqueueLocalChunk])

  const sendRealtimeEvent = useCallback((event: Record<string, unknown>) => {
    const channel = dataChannelRef.current
    if (!channel || channel.readyState !== 'open') return false
    channel.send(JSON.stringify(event))
    return true
  }, [])

  const cleanupRealtimeConnection = useCallback(() => {
    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current)
      commitTimerRef.current = null
    }

    dataChannelRef.current?.close()
    dataChannelRef.current = null

    if (peerConnectionRef.current) peerConnectionRef.current.onconnectionstatechange = null
    peerConnectionRef.current?.close()
    peerConnectionRef.current = null

  }, [])

  const cleanupRealtimeResources = useCallback(() => {
    cleanupRealtimeConnection()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [cleanupRealtimeConnection])

  const switchToLocalFallback = useCallback((message: string) => {
    cleanupRealtimeConnection()
    activateLocalChunkTranscription()
    modeRef.current = 'local'
    setMode('local')
    setConnectionError(message)
    setState('recording')
  }, [activateLocalChunkTranscription, cleanupRealtimeConnection])

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
          onTranscriptCompleted(text, itemId, {
            source: 'realtime',
            alreadyPersisted: false,
            payload: payload as Record<string, unknown>,
          })
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
    const sessionController = new AbortController()
    sessionAbortRef.current?.abort()
    sessionAbortRef.current = sessionController
    audioChunksRef.current = []
    bufferedLocalChunksRef.current = []
    localChunkQueueRef.current = Promise.resolve()
    localChunkDispositionRef.current = 'buffer'
    localChunkSessionRef.current += 1
    localChunkSequenceRef.current = 0
    fallbackActivatedRef.current = false
    partialItemsRef.current.clear()
    setLiveTranscript('')
    setConnectionError(null)
    setMode('none')
    modeRef.current = 'none'

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      })
      if (sessionController.signal.aborted) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
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
      recorder.start()
      startLocalChunkRecorder()
      modeRef.current = 'local'
      setMode('local')
      setState('recording')

      try {
        // O segredo é temporário e vem do backend; a chave permanente da
        // OpenAI nunca é exposta ao navegador.
        const { value: ephemeralKey } = await api.consultations.createRealtimeToken(consultationId)
        if (sessionController.signal.aborted || !recorderRef.current) return

        const peerConnection = new RTCPeerConnection()
        peerConnectionRef.current = peerConnection
        peerConnection.onconnectionstatechange = () => {
          if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
            switchToLocalFallback('A conexão em tempo real caiu. O áudio continua sendo gravado localmente.')
          }
        }

        stream.getAudioTracks().forEach((track) => {
          peerConnection.addTrack(track, stream)
        })

        // O data channel recebe deltas parciais e eventos completos da
        // transcrição sem precisar esperar o fim da consulta.
        const dataChannel = peerConnection.createDataChannel('oai-events')
        dataChannelRef.current = dataChannel
        dataChannel.addEventListener('message', handleRealtimeMessage)

        const offer = await peerConnection.createOffer()
        if (!offer.sdp) throw new Error('Não foi possível preparar a conexão em tempo real')
        await peerConnection.setLocalDescription(offer)

        const connectionTimeout = window.setTimeout(() => sessionController.abort(), 15_000)
        let sdpResponse: Response
        try {
          sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
            method: 'POST',
            body: offer.sdp,
            headers: { Authorization: `Bearer ${ephemeralKey}`, 'Content-Type': 'application/sdp' },
            signal: sessionController.signal,
          })
        } finally {
          window.clearTimeout(connectionTimeout)
        }

        if (!sdpResponse.ok) throw new Error('O serviço de transcrição em tempo real não respondeu')
        if (sessionController.signal.aborted || !recorderRef.current) return

        await peerConnection.setRemoteDescription({ type: 'answer', sdp: await sdpResponse.text() })
        await waitForDataChannelOpen(dataChannel)
        if (fallbackActivatedRef.current || sessionController.signal.aborted || !recorderRef.current) {
          return
        }

        discardBufferedLocalChunks()
        modeRef.current = 'realtime'
        setMode('realtime')

        commitTimerRef.current = setInterval(() => {
          sendRealtimeEvent({ type: 'input_audio_buffer.commit' })
        }, commitIntervalMs)

        setState('recording')
      } catch (realtimeError) {
        if (sessionController.signal.aborted && !recorderRef.current) return
        switchToLocalFallback(
          realtimeError instanceof Error
            ? `${realtimeError.message}. O áudio continua sendo gravado localmente.`
            : 'Realtime indisponível. O áudio continua sendo gravado localmente.'
        )
      }
    } catch (error) {
      await stopLocalChunkRecorder(false)
      await stopLocalRecorder()
      cleanupRealtimeResources()
      setState('idle')
      setMode('none')
      modeRef.current = 'none'
      throw error
    } finally {
      isStartingRef.current = false
    }
  }, [
    cleanupRealtimeResources,
    commitIntervalMs,
    consultationId,
    discardBufferedLocalChunks,
    handleRealtimeMessage,
    sendRealtimeEvent,
    startLocalChunkRecorder,
    state,
    stopLocalChunkRecorder,
    stopLocalRecorder,
    switchToLocalFallback,
    waitForDataChannelOpen,
  ])

  const stopRecording = useCallback(async () => {
    if (state !== 'recording') return

    setState('processing')
    sessionAbortRef.current?.abort()
    sessionAbortRef.current = null
    const completedMode = modeRef.current === 'local' ? 'local' : 'realtime'

    if (commitTimerRef.current) {
      clearInterval(commitTimerRef.current)
      commitTimerRef.current = null
    }

    if (completedMode === 'realtime') {
      // Dá uma última confirmação ao Realtime e aguarda os eventos finais
      // antes de fechar a conexão, evitando perder as últimas palavras.
      sendRealtimeEvent({ type: 'input_audio_buffer.commit' })
      await waitForPendingTranscripts(1600)
    }

    await stopLocalChunkRecorder(completedMode === 'local')
    const fullBlob = await stopLocalRecorder()
    cleanupRealtimeResources()
    partialItemsRef.current.clear()
    setLiveTranscript('')

    try {
      if (onStopRef.current && fullBlob) {
        await onStopRef.current(fullBlob, { mode: completedMode })
      }
    } finally {
      setState('idle')
      setMode('none')
      modeRef.current = 'none'
    }
  }, [
    cleanupRealtimeResources,
    sendRealtimeEvent,
    state,
    stopLocalChunkRecorder,
    stopLocalRecorder,
    waitForPendingTranscripts,
  ])

  useEffect(() => {
    const partialItems = partialItemsRef.current
    return () => {
      sessionAbortRef.current?.abort()
      sessionAbortRef.current = null
      const completedMode = modeRef.current === 'realtime' ? 'realtime' : 'local'
      void (async () => {
        await stopLocalChunkRecorder(completedMode === 'local')
        const fullBlob = await stopLocalRecorder()
        cleanupRealtimeResources()
        partialItems.clear()
        if (onStopRef.current && fullBlob) {
          await onStopRef.current(fullBlob, { mode: completedMode }).catch((error) => {
            console.error('Erro ao preservar audio ao sair da consulta:', error)
          })
        }
      })()
    }
  }, [cleanupRealtimeResources, stopLocalChunkRecorder, stopLocalRecorder])

  return {
    state,
    liveTranscript,
    mode,
    connectionError,
    startRecording,
    stopRecording,
  }
}
