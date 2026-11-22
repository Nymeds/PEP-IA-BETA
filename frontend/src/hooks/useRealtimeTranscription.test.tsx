import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/services/api'
import { useRealtimeTranscription } from './useRealtimeTranscription'

vi.mock('@/services/api', () => ({
  api: {
    consultations: {
      createRealtimeToken: vi.fn(),
      transcribeChunk: vi.fn(),
    },
  },
}))

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = []

  static isTypeSupported() {
    return true
  }

  readonly mimeType: string
  state: RecordingState = 'inactive'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super()
    this.mimeType = options?.mimeType || 'audio/webm'
    FakeMediaRecorder.instances.push(this)
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'

    const isAuditRecorder = FakeMediaRecorder.instances[0] === this
    const data = new Blob(
      [isAuditRecorder ? 'audio-completo-para-auditoria' : 'chunk'],
      { type: this.mimeType }
    )
    this.ondataavailable?.({ data } as BlobEvent)
    this.onstop?.()
    this.dispatchEvent(new Event('stop'))
  }
}

class FakeDataChannel extends EventTarget {
  readyState: RTCDataChannelState = 'open'
  send = vi.fn()

  close() {
    this.readyState = 'closed'
  }
}

class FakePeerConnection {
  connectionState: RTCPeerConnectionState = 'connected'
  onconnectionstatechange: (() => void) | null = null
  readonly channel = new FakeDataChannel()

  addTrack() {
    return {}
  }

  createDataChannel() {
    return this.channel
  }

  async createOffer() {
    return { type: 'offer' as const, sdp: 'offer-sdp' }
  }

  async setLocalDescription() {
    return undefined
  }

  async setRemoteDescription() {
    return undefined
  }

  close() {
    this.connectionState = 'closed'
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

describe('useRealtimeTranscription - fallback local', () => {
  const createRealtimeToken = vi.mocked(api.consultations.createRealtimeToken)
  const transcribeChunk = vi.mocked(api.consultations.transcribeChunk)
  const trackStop = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    FakeMediaRecorder.instances = []
    trackStop.mockReset()
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: trackStop }],
          getAudioTracks: () => [{ stop: trackStop }],
        } as unknown as MediaStream),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('transcreve chunks em ordem e preserva o áudio completo sem retranscrevê-lo', async () => {
    const token = deferred<{ value: string; expiresAt: number | null }>()
    createRealtimeToken.mockReturnValue(token.promise)
    transcribeChunk
      .mockResolvedValueOnce({
        chunkTranscript: 'primeiro trecho',
        fullTranscript: 'primeiro trecho',
      })
      .mockResolvedValueOnce({
        chunkTranscript: 'segundo trecho',
        fullTranscript: 'primeiro trecho\nsegundo trecho',
      })

    const onTranscriptCompleted = vi.fn().mockResolvedValue(undefined)
    const onStop = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() =>
      useRealtimeTranscription({
        consultationId: 'consulta-1',
        localChunkIntervalMs: 5000,
        onTranscriptCompleted,
        onStop,
      })
    )

    let starting!: Promise<void>
    await act(async () => {
      starting = result.current.startRecording()
      await Promise.resolve()
    })

    expect(FakeMediaRecorder.instances).toHaveLength(2)
    expect(result.current.mode).toBe('local')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(transcribeChunk).not.toHaveBeenCalled()

    await act(async () => {
      token.reject(new Error('Realtime indisponível'))
      await starting
      await Promise.resolve()
    })

    expect(transcribeChunk).toHaveBeenCalledTimes(1)
    expect(onTranscriptCompleted).toHaveBeenNthCalledWith(
      1,
      'primeiro trecho',
      'local-1-1',
      {
        source: 'local',
        alreadyPersisted: true,
        fullTranscript: 'primeiro trecho',
      }
    )

    await act(async () => {
      await result.current.stopRecording()
    })

    expect(transcribeChunk).toHaveBeenCalledTimes(2)
    expect(onTranscriptCompleted).toHaveBeenNthCalledWith(
      2,
      'segundo trecho',
      'local-1-2',
      {
        source: 'local',
        alreadyPersisted: true,
        fullTranscript: 'primeiro trecho\nsegundo trecho',
      }
    )
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({ size: 'audio-completo-para-auditoria'.length }),
      { mode: 'local' }
    )

    const sentChunks = transcribeChunk.mock.calls.map(([, blob]) => blob)
    expect(sentChunks.every((blob) => blob.size === 'chunk'.length)).toBe(true)
    expect(sentChunks.some((blob) => blob.size === 'audio-completo-para-auditoria'.length)).toBe(false)

    unmount()
  })

  it('descarta os chunks de segurança quando o Realtime conecta', async () => {
    createRealtimeToken.mockResolvedValue({
      value: 'chave-efêmera',
      expiresAt: null,
    })
    vi.stubGlobal('RTCPeerConnection', FakePeerConnection)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue('answer-sdp'),
    }))

    const onTranscriptCompleted = vi.fn().mockResolvedValue(undefined)
    const onStop = vi.fn().mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() =>
      useRealtimeTranscription({
        consultationId: 'consulta-2',
        localChunkIntervalMs: 5000,
        onTranscriptCompleted,
        onStop,
      })
    )

    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.mode).toBe('realtime')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(transcribeChunk).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.stopRecording()
    })

    expect(transcribeChunk).not.toHaveBeenCalled()
    expect(onTranscriptCompleted).not.toHaveBeenCalled()
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({ size: 'audio-completo-para-auditoria'.length }),
      { mode: 'realtime' }
    )

    unmount()
  })
})
