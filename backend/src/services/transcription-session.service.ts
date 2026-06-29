import { getPrisma } from '../lib/prisma'

interface PersistSegmentInput {
  consultationId: string
  userId: string
  seq: number
  text: string
  status: 'confirmed' | 'empty'
  startedAtMs?: number
  endedAtMs?: number
  size?: number
}

interface TranscriptSegment {
  seq: number
  text: string
  status: 'confirmed' | 'empty'
  startedAtMs?: number
  endedAtMs?: number
  size?: number
  createdAt: string
}

function parseSegments(value?: string | null): TranscriptSegment[] {
  if (!value?.trim()) return []
  try {
    const parsed = JSON.parse(value) as TranscriptSegment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildFullTranscript(segments: TranscriptSegment[]) {
  return segments
    .filter((segment) => segment.status === 'confirmed' && segment.text.trim())
    .sort((a, b) => a.seq - b.seq)
    .map((segment) => segment.text.trim())
    .join('\n')
    .trim()
}

export async function persistTranscriptionSegment(input: PersistSegmentInput) {
  const consultation = await getPrisma().consultation.findFirst({
    where: { id: input.consultationId, userId: input.userId },
    select: { id: true, transcriptSegmentsJson: true },
  })

  if (!consultation) {
    throw new Error('Consulta nao encontrada')
  }

  const segments = parseSegments(consultation.transcriptSegmentsJson)
  const nextSegment: TranscriptSegment = {
    seq: input.seq,
    text: input.text,
    status: input.status,
    startedAtMs: input.startedAtMs,
    endedAtMs: input.endedAtMs,
    size: input.size,
    createdAt: new Date().toISOString(),
  }

  const withoutCurrent = segments.filter((segment) => segment.seq !== input.seq)
  const nextSegments = [...withoutCurrent, nextSegment].sort((a, b) => a.seq - b.seq)
  const fullTranscript = buildFullTranscript(nextSegments)

  await getPrisma().consultation.update({
    where: { id: consultation.id },
    data: {
      transcriptSegmentsJson: JSON.stringify(nextSegments),
      transcript: fullTranscript || null,
    },
  })

  return {
    segments: nextSegments,
    fullTranscript,
  }
}
