import type {
  DynamicDialogueTurn,
  DynamicParticipant,
  DynamicQuarantineItem,
  DynamicSpeakerRoleSource,
} from '@/types/forms'

export type DynamicVoiceRole = 'profissional' | 'paciente' | 'participante' | 'desconhecido'
export type DynamicTurnAiUsage =
  | 'uso_clinico'
  | 'citacao_atribuida'
  | 'revisao_obrigatoria'
  | 'ignorado'

export interface DynamicVoicePresentation {
  key: string
  diarizationLabel: string | null
  displayName: string
  role: DynamicVoiceRole
  roleSource: DynamicSpeakerRoleSource
  roleConfidence: number | null
  participant: DynamicParticipant | null
  authorized: boolean
  excludedFromAi: boolean
  partiallyExcludedFromAi: boolean
  turnCount: number
}

export interface DynamicAiVoiceReadiness {
  canUseAi: boolean
  voices: DynamicVoicePresentation[]
  authorizedTurnCount: number
  excludedTurnCount: number
  contextualTurnCount: number
  reviewRequiredTurnCount: number
  unknownVoiceCount: number
}

const TECHNICAL_SPEAKER_LABEL = /^(?:speaker|spk|falante|voice|voz)[\s_-]*[a-z0-9]+$/i
const SINGLE_TECHNICAL_LABEL = /^[a-z]$/i
const INFORMATIONAL_UNKNOWN_QUARANTINE = new Set([
  'falante_desconhecido',
  'falante_desconhecido_excluido',
  'voz_desconhecida_excluida',
  'irrelevante',
  'fala_irrelevante',
])

export function dynamicQuarantineBlocksFinalization(item: DynamicQuarantineItem) {
  if (typeof item.blocksFinalization === 'boolean') return item.blocksFinalization
  return !INFORMATIONAL_UNKNOWN_QUARANTINE.has(item.kind)
}

export function isTechnicalSpeakerLabel(value?: string | null) {
  const normalized = value?.trim()
  if (!normalized) return false
  return TECHNICAL_SPEAKER_LABEL.test(normalized) || SINGLE_TECHNICAL_LABEL.test(normalized)
}

export function safeSpeakerDisplayName(
  displayName?: string | null,
  fallback: 'identificada' | 'nao_identificada' = 'nao_identificada'
) {
  const normalized = displayName?.trim()
  if (normalized && !isTechnicalSpeakerLabel(normalized)) return normalized
  return fallback === 'identificada' ? 'Voz identificada' : 'Voz não identificada'
}

function normalizedVoiceKeyPart(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Produz a mesma chave em todos os consumidores visuais da conversa.
 * Sem rótulo acústico, somente identidades semânticas seguras são agrupadas.
 * Uma fala realmente indefinida recebe a própria posição e nunca é fundida
 * com todas as demais falas sem rótulo.
 */
export function dynamicVoiceGroupKey(turn: DynamicDialogueTurn, turnIndex: number) {
  const diarizationLabel = turn.diarizationLabel?.trim()
  if (diarizationLabel) return `rotulo:${diarizationLabel}`

  const participantId = turn.participantId?.trim()
  if (participantId) return `participante:${participantId}`

  if (turn.speaker === 'Medico') return 'papel:profissional'
  if (turn.speaker === 'Paciente') return 'papel:paciente'

  const contextualRelation = turn.contextualRelation?.trim()
  if (contextualRelation) {
    return `relacao:${normalizedVoiceKeyPart(contextualRelation)}`
  }

  return `indefinida:${turnIndex}`
}

export function dynamicTurnIsExcludedFromAi(
  turn: DynamicDialogueTurn,
  voice: DynamicVoicePresentation
) {
  return getDynamicTurnAiUsage(turn, voice) === 'ignorado'
}

function turnUsage(
  turn: DynamicDialogueTurn,
  role: DynamicVoiceRole,
  participant: DynamicParticipant | null
): DynamicTurnAiUsage {
  if (turn.participantAuthorized === false) return 'ignorado'
  if (turn.sessionReviewAuthorized === true) return 'revisao_obrigatoria'
  if (turn.sessionContextAuthorized === true) return 'citacao_atribuida'
  if (role === 'desconhecido') return 'ignorado'

  const participantIsAuthorized = Boolean(
    participant?.active && participant.authorized
  )
  if (turn.participantAuthorized === true || participantIsAuthorized) {
    return role === 'participante' ? 'citacao_atribuida' : 'uso_clinico'
  }

  return 'ignorado'
}

export function getDynamicTurnAiUsage(
  turn: DynamicDialogueTurn,
  voice: DynamicVoicePresentation
) {
  return turnUsage(turn, voice.role, voice.participant)
}

export function dynamicTurnCanFillPep(
  turn: DynamicDialogueTurn,
  voice: DynamicVoicePresentation
) {
  return getDynamicTurnAiUsage(turn, voice) === 'uso_clinico'
}

function participantRole(participant?: DynamicParticipant | null): DynamicVoiceRole | null {
  if (!participant) return null
  const role = participant.role.toLocaleLowerCase('pt-BR')
  if (role === 'profissional' || role === 'medico' || role === 'médico') return 'profissional'
  if (role === 'paciente') return 'paciente'
  return 'participante'
}

function turnRole(turns: DynamicDialogueTurn[]): DynamicVoiceRole {
  if (turns.some((turn) => turn.speaker === 'Medico')) return 'profissional'
  if (turns.some((turn) => turn.speaker === 'Paciente')) return 'paciente'
  if (turns.some((turn) => turn.speaker === 'Terceiro' && turn.contextualRelation)) {
    return 'participante'
  }
  return 'desconhecido'
}

function roleSource(
  turns: DynamicDialogueTurn[],
  participant: DynamicParticipant | null
): DynamicSpeakerRoleSource {
  if (turns.some((turn) => turn.roleSource === 'manual')) return 'manual'
  if (turns.some((turn) => turn.roleSource === 'automatico')) return 'automatico'
  if (participant) return 'manual'
  if (turns.some((turn) => turn.speaker === 'Medico' || turn.speaker === 'Paciente')) {
    return 'automatico'
  }
  return 'desconhecido'
}

function roleConfidence(turns: DynamicDialogueTurn[]) {
  const values = turns
    .map((turn) => turn.roleConfidence)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  if (!values.length) return null
  return Math.max(...values.map((value) => Math.min(1, Math.max(0, value))))
}

function participantForTurns(
  turns: DynamicDialogueTurn[],
  participantsById: Map<string, DynamicParticipant>,
  participantsByLabel: Map<string, DynamicParticipant>
) {
  for (const turn of turns) {
    if (turn.participantId) {
      const byId = participantsById.get(turn.participantId)
      if (byId?.active) return byId
    }
    if (turn.diarizationLabel) {
      const byLabel = participantsByLabel.get(turn.diarizationLabel)
      if (byLabel?.active) return byLabel
    }
  }
  return null
}

function knownDisplayName(
  role: DynamicVoiceRole,
  participant: DynamicParticipant | null,
  turns: DynamicDialogueTurn[]
) {
  if (role === 'profissional') return 'Profissional'
  if (role === 'paciente') return 'Paciente'
  if (role === 'participante') {
    const contextualName = turns.find((turn) => turn.contextualRelation)?.contextualRelation
    return safeSpeakerDisplayName(participant?.name || contextualName, 'identificada')
  }
  return null
}

export function getDynamicAiVoiceReadiness(
  turns: DynamicDialogueTurn[],
  participants: DynamicParticipant[]
): DynamicAiVoiceReadiness {
  const participantsById = new Map(participants.map((participant) => [participant.id, participant]))
  const participantsByLabel = new Map(
    participants
      .filter((participant) => participant.active && participant.speakerLabel)
      .map((participant) => [participant.speakerLabel!, participant])
  )
  const grouped = new Map<string, DynamicDialogueTurn[]>()

  turns.forEach((turn, turnIndex) => {
    const key = dynamicVoiceGroupKey(turn, turnIndex)
    grouped.set(key, [...(grouped.get(key) || []), turn])
  })

  let unknownIndex = 0
  let authorizedTurnCount = 0
  let excludedTurnCount = 0
  let contextualTurnCount = 0
  let reviewRequiredTurnCount = 0
  const voices = Array.from(grouped.entries()).map(([key, voiceTurns]) => {
    const participant = participantForTurns(voiceTurns, participantsById, participantsByLabel)
    const role = participantRole(participant) || turnRole(voiceTurns)
    const usages = voiceTurns.map((turn) => turnUsage(turn, role, participant))
    const eligibleTurnCount = usages.filter((usage) => usage !== 'ignorado').length
    const contextualVoiceTurnCount = usages.filter(
      (usage) => usage === 'citacao_atribuida'
    ).length
    const reviewVoiceTurnCount = usages.filter(
      (usage) => usage === 'revisao_obrigatoria'
    ).length
    const excludedVoiceTurnCount = voiceTurns.length - eligibleTurnCount
    authorizedTurnCount += eligibleTurnCount
    excludedTurnCount += excludedVoiceTurnCount
    contextualTurnCount += contextualVoiceTurnCount
    reviewRequiredTurnCount += reviewVoiceTurnCount
    const knownName = knownDisplayName(role, participant, voiceTurns)
    if (!knownName) unknownIndex += 1

    return {
      key,
      diarizationLabel: voiceTurns[0]?.diarizationLabel?.trim() || null,
      displayName: knownName || `Desconhecido ${unknownIndex}`,
      role,
      roleSource: roleSource(voiceTurns, participant),
      roleConfidence: roleConfidence(voiceTurns),
      participant,
      authorized: eligibleTurnCount > 0,
      excludedFromAi: eligibleTurnCount === 0,
      partiallyExcludedFromAi: eligibleTurnCount > 0 && excludedVoiceTurnCount > 0,
      turnCount: voiceTurns.length,
    } satisfies DynamicVoicePresentation
  })

  return {
    canUseAi: authorizedTurnCount > 0,
    voices,
    authorizedTurnCount,
    excludedTurnCount,
    contextualTurnCount,
    reviewRequiredTurnCount,
    unknownVoiceCount: voices.filter((voice) => voice.role === 'desconhecido').length,
  }
}
