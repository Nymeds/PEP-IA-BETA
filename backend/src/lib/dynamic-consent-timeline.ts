export interface ConsentTimelineEvent {
  type: string
  participantId?: string | null
  granted: boolean
  recordedAt: Date
  revokedAt?: Date | null
}

interface ConsentSelector {
  type: string
  participantId?: string | null
}

interface TurnOccurrenceInput {
  startedAt?: Date | null
  turnStartSeconds?: number | null
  audioSavedAt?: Date | null
  finishedAt?: Date | null
}

const MAX_REASONABLE_TURN_OFFSET_MS = 24 * 60 * 60 * 1000
const END_TIMESTAMP_TOLERANCE_MS = 30_000

function validTimestamp(value?: Date | null) {
  if (!(value instanceof Date)) return null
  const timestamp = value.getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function sameParticipant(
  eventParticipantId: string | null | undefined,
  selectedParticipantId: string | null | undefined
) {
  return (eventParticipantId || null) === (selectedParticipantId || null)
}

/**
 * Retorna a decisão que estava vigente no instante informado.
 *
 * A coleção pode vir em qualquer ordem. Eventos registrados depois da fala não
 * alteram retroativamente a decisão daquele instante.
 */
export function consentWasGrantedAt(
  events: ConsentTimelineEvent[],
  selector: ConsentSelector,
  referenceAt?: Date | null
) {
  const referenceTimestamp = validTimestamp(referenceAt)
  if (referenceTimestamp == null) return false

  let currentEvent: ConsentTimelineEvent | undefined
  let currentTimestamp = Number.NEGATIVE_INFINITY

  for (const event of events) {
    if (
      event.type !== selector.type ||
      !sameParticipant(event.participantId, selector.participantId)
    ) {
      continue
    }

    const eventTimestamp = validTimestamp(event.recordedAt)
    if (
      eventTimestamp == null ||
      eventTimestamp > referenceTimestamp ||
      eventTimestamp <= currentTimestamp
    ) {
      continue
    }

    currentEvent = event
    currentTimestamp = eventTimestamp
  }

  if (!currentEvent?.granted) return false

  const revokedTimestamp = validTimestamp(currentEvent.revokedAt)
  return revokedTimestamp == null || revokedTimestamp > referenceTimestamp
}

/**
 * Estima quando um turno ocorreu a partir do início real da consulta.
 *
 * `audioSavedAt`/`finishedAt` servem apenas como limite de segurança; nunca
 * viram o horário-base, pois isso autorizaria retroativamente falas anteriores.
 * Na ausência de um offset confiável, usamos o próprio início da consulta, que
 * é a alternativa conservadora.
 */
export function estimateDialogueTurnOccurredAt({
  startedAt,
  turnStartSeconds,
  audioSavedAt,
  finishedAt,
}: TurnOccurrenceInput): Date | null {
  const startedTimestamp = validTimestamp(startedAt)
  if (startedTimestamp == null) return null

  const offsetMs = typeof turnStartSeconds === 'number' && Number.isFinite(turnStartSeconds)
    ? Math.round(turnStartSeconds * 1000)
    : 0
  if (offsetMs < 0 || offsetMs > MAX_REASONABLE_TURN_OFFSET_MS) {
    return new Date(startedTimestamp)
  }

  const estimatedTimestamp = startedTimestamp + offsetMs
  if (!Number.isSafeInteger(estimatedTimestamp)) return new Date(startedTimestamp)

  const endTimestamps = [validTimestamp(audioSavedAt), validTimestamp(finishedAt)]
    .filter((timestamp): timestamp is number =>
      timestamp != null && timestamp >= startedTimestamp
    )
  const trustedEndTimestamp = endTimestamps.length
    ? Math.min(...endTimestamps)
    : null

  if (
    trustedEndTimestamp != null &&
    estimatedTimestamp > trustedEndTimestamp + END_TIMESTAMP_TOLERANCE_MS
  ) {
    return new Date(startedTimestamp)
  }

  return new Date(
    trustedEndTimestamp == null
      ? estimatedTimestamp
      : Math.min(estimatedTimestamp, trustedEndTimestamp)
  )
}
