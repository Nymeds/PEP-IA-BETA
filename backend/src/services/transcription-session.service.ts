import { FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { getPrisma } from '../lib/prisma'
import { transcribeAudioBuffer } from './speech.service'

export type TranscriptionEventType =
  | 'connected'
  | 'chunk_queued'
  | 'chunk_processing'
  | 'transcript_done'
  | 'chunk_error'
  | 'queue_idle'

export interface TranscriptionSegment {
  id: string
  seq: number
  text: string
  status: 'confirmed' | 'empty' | 'error'
  startedAtMs?: number
  endedAtMs?: number
  size?: number
  error?: string
  createdAt: string
}

interface QueueItem {
  id: string
  consultationId: string
  userId: string
  seq: number
  buffer: Buffer
  mimeType: string
  startedAtMs?: number
  endedAtMs?: number
  size: number
}

interface QueueState {
  items: QueueItem[]
  processing: boolean
  idleResolvers: Array<() => void>
}

interface SseClient {
  id: string
  reply: FastifyReply
}

const queues = new Map<string, QueueState>()
const clients = new Map<string, Map<string, SseClient>>()

function sessionKey(consultationId: string, userId: string) {
  return `${userId}:${consultationId}`
}

function getQueue(key: string): QueueState {
  let queue = queues.get(key)
  if (!queue) {
    queue = { items: [], processing: false, idleResolvers: [] }
    queues.set(key, queue)
  }
  return queue
}

function emitEvent(key: string, type: TranscriptionEventType, payload: Record<string, unknown>) {
  const sessionClients = clients.get(key)
  if (!sessionClients?.size) return

  const data = JSON.stringify({ type, ...payload })
  for (const [clientId, client] of sessionClients) {
    try {
      client.reply.raw.write(`event: ${type}\n`)
      client.reply.raw.write(`data: ${data}\n\n`)
    } catch {
      sessionClients.delete(clientId)
    }
  }
}

function parseSegments(value?: string | null): TranscriptionSegment[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as TranscriptionSegment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildTranscript(segments: TranscriptionSegment[]) {
  return segments
    .filter((segment) => segment.status === 'confirmed' && segment.text.trim())
    .sort((a, b) => a.seq - b.seq)
    .map((segment) => segment.text.trim())
    .join(' ')
    .trim()
}

async function appendSegment(item: QueueItem, segment: Omit<TranscriptionSegment, 'id' | 'seq' | 'createdAt'>) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: item.consultationId, userId: item.userId },
    select: { id: true, transcript: true, transcriptSegmentsJson: true },
  })

  if (!consultation) return { fullTranscript: '', segment: null as TranscriptionSegment | null }

  const previousSegments = parseSegments(consultation.transcriptSegmentsJson)
  if (!previousSegments.length && consultation.transcript?.trim()) {
    previousSegments.push({
      id: 'legacy-transcript',
      seq: 0,
      text: consultation.transcript,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    })
  }
  const nextSegment: TranscriptionSegment = {
    id: item.id,
    seq: item.seq,
    createdAt: new Date().toISOString(),
    ...segment,
  }

  const withoutSameSeq = previousSegments.filter((current) => current.seq !== item.seq)
  const nextSegments = [...withoutSameSeq, nextSegment].sort((a, b) => a.seq - b.seq)
  const fullTranscript = buildTranscript(nextSegments)

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: {
      transcript: fullTranscript || consultation.transcript,
      transcriptSegmentsJson: JSON.stringify(nextSegments),
    },
  })

  return { fullTranscript, segment: nextSegment }
}

function resolveIdle(queue: QueueState) {
  if (queue.processing || queue.items.length) return
  const resolvers = queue.idleResolvers.splice(0)
  resolvers.forEach((resolve) => resolve())
}

async function processQueue(key: string, queue: QueueState) {
  if (queue.processing) return
  queue.processing = true

  while (queue.items.length) {
    const item = queue.items.shift()!
    emitEvent(key, 'chunk_processing', { chunkId: item.id, seq: item.seq })

    try {
      const startedAt = Date.now()
      const text = await transcribeAudioBuffer(item.buffer, item.mimeType)
      const elapsedMs = Date.now() - startedAt
      const status: TranscriptionSegment['status'] = text.trim() ? 'confirmed' : 'empty'

      const { fullTranscript, segment } = await appendSegment(item, {
        text,
        status,
        startedAtMs: item.startedAtMs,
        endedAtMs: item.endedAtMs,
        size: item.size,
      })

      emitEvent(key, 'transcript_done', {
        chunkId: item.id,
        seq: item.seq,
        text,
        status,
        elapsedMs,
        fullTranscript,
        segment,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao transcrever audio'
      const { fullTranscript, segment } = await appendSegment(item, {
        text: '',
        status: 'error',
        startedAtMs: item.startedAtMs,
        endedAtMs: item.endedAtMs,
        size: item.size,
        error: message,
      })

      emitEvent(key, 'chunk_error', {
        chunkId: item.id,
        seq: item.seq,
        error: message,
        fullTranscript,
        segment,
      })
    }
  }

  queue.processing = false
  emitEvent(key, 'queue_idle', {})
  resolveIdle(queue)
}

export function hasTranscriptionClients(consultationId: string, userId: string) {
  return Boolean(clients.get(sessionKey(consultationId, userId))?.size)
}

export function registerTranscriptionClient(consultationId: string, userId: string, reply: FastifyReply) {
  const key = sessionKey(consultationId, userId)
  const clientId = randomUUID()
  let sessionClients = clients.get(key)
  if (!sessionClients) {
    sessionClients = new Map()
    clients.set(key, sessionClients)
  }

  reply.hijack()
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  reply.raw.write('\n')

  const client: SseClient = { id: clientId, reply }
  sessionClients.set(clientId, client)

  emitEvent(key, 'connected', { clientId })

  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(': ping\n\n')
    } catch {
      clearInterval(heartbeat)
      sessionClients?.delete(clientId)
    }
  }, 15000)

  reply.raw.on('close', () => {
    clearInterval(heartbeat)
    sessionClients?.delete(clientId)
    if (!sessionClients?.size) clients.delete(key)
  })
}

export function enqueueTranscriptionChunk(input: Omit<QueueItem, 'id'>) {
  const id = randomUUID()
  const key = sessionKey(input.consultationId, input.userId)
  const queue = getQueue(key)
  const item: QueueItem = { id, ...input }

  queue.items.push(item)
  emitEvent(key, 'chunk_queued', { chunkId: id, seq: item.seq, size: item.size })
  void processQueue(key, queue)

  return { chunkId: id, seq: item.seq }
}

export function waitForTranscriptionIdle(consultationId: string, userId: string, timeoutMs = 60000) {
  const key = sessionKey(consultationId, userId)
  const queue = getQueue(key)
  if (!queue.processing && queue.items.length === 0) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      const index = queue.idleResolvers.indexOf(done)
      if (index >= 0) queue.idleResolvers.splice(index, 1)
      resolve()
    }, timeoutMs)

    const done = () => {
      clearTimeout(timer)
      resolve()
    }

    queue.idleResolvers.push(done)
  })
}
