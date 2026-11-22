import { describe, expect, it } from 'vitest'
import type {
  DynamicConsent,
  DynamicConsultationRuntime,
  DynamicParticipant,
  DynamicQuarantineItem,
} from '@/types/forms'
import { getDynamicRecordingBlockers, isDynamicRecordingReady } from './DynamicPreparationPanel'
import {
  dynamicTurnCanFillPep,
  dynamicVoiceGroupKey,
  getDynamicTurnAiUsage,
  getDynamicAiVoiceReadiness,
  dynamicQuarantineBlocksFinalization,
  safeSpeakerDisplayName,
} from './dynamic-voice-readiness'

function consent(
  type: DynamicConsent['type'],
  granted: boolean,
  participantId: string | null = null
): DynamicConsent {
  return {
    id: `${type}:${granted}:${participantId || 'consulta'}`,
    consultationId: 'consulta-1',
    participantId,
    type,
    granted,
    termsVersion: 'v1',
    evidenceJson: null,
    recordedAt: new Date().toISOString(),
    revokedAt: null,
  }
}

function participant(
  id: string,
  role: string,
  authorized: boolean,
  speakerLabel: string | null = null
): DynamicParticipant {
  return {
    id,
    consultationId: 'consulta-1',
    name: id,
    role,
    speakerLabel,
    authorized,
    authorizedAt: authorized ? new Date().toISOString() : null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function runtime(
  consents: DynamicConsent[],
  participants: DynamicParticipant[]
): DynamicConsultationRuntime {
  return { consents, participants } as DynamicConsultationRuntime
}

describe('barreiras de segurança da consulta dinâmica', () => {
  it('bloqueia a gravação quando falta consentimento global ou há participante ativo sem autorização', () => {
    const professional = participant('profissional', 'profissional', true)
    const patient = participant('paciente', 'paciente', false)

    expect(isDynamicRecordingReady(runtime([
      consent('gravacao_audio', true),
      consent('transcricao_ia', true),
    ], [professional, patient]))).toBe(false)
    expect(getDynamicRecordingBlockers(runtime([], [professional, patient]))).toEqual([
      'consentimento para gravação de áudio',
      'consentimento para transcrição e IA',
      'participação de paciente',
    ])

    patient.authorized = true
    expect(isDynamicRecordingReady(runtime([
      consent('gravacao_audio', true),
      consent('transcricao_ia', true),
    ], [professional, patient]))).toBe(false)

    expect(isDynamicRecordingReady(runtime([
      consent('gravacao_audio', false),
      consent('transcricao_ia', true),
    ], [professional, patient]))).toBe(false)
  })

  it('libera a gravação somente com as duas decisões globais positivas e participantes autorizados', () => {
    expect(isDynamicRecordingReady(runtime([
      consent('gravacao_audio', true),
      consent('gravacao_audio', false),
      consent('transcricao_ia', true),
      consent('participacao', true, 'paciente'),
      consent('participacao', true, 'responsavel'),
    ], [
      participant('profissional', 'profissional', true),
      participant('paciente', 'paciente', true),
      participant('responsavel', 'responsavel', true),
    ]))).toBe(true)
  })

  it('libera a IA com falas autorizadas e ignora desconhecidos sem contexto clínico', () => {
    const participants = [
      participant('profissional', 'profissional', true),
      participant('paciente', 'paciente', true),
    ]

    const readiness = getDynamicAiVoiceReadiness([
      { speaker: 'Medico', text: 'Como você está?', diarizationLabel: 'speaker_0', roleSource: 'automatico', participantId: 'profissional', participantAuthorized: true },
      { speaker: 'Paciente', text: 'Estou melhor.', diarizationLabel: 'speaker_1', roleSource: 'automatico', participantId: 'paciente', participantAuthorized: true },
      { speaker: 'Indefinido', text: 'Uma fala ao fundo.', diarizationLabel: 'speaker_2' },
    ], participants)

    expect(readiness.canUseAi).toBe(true)
    expect(readiness.authorizedTurnCount).toBe(2)
    expect(readiness.excludedTurnCount).toBe(1)
    expect(readiness.unknownVoiceCount).toBe(1)
    expect(readiness.voices.map((voice) => voice.displayName)).toEqual([
      'Profissional',
      'Paciente',
      'Desconhecido 1',
    ])
    expect(readiness.voices.at(-1)?.excludedFromAi).toBe(true)
  })

  it('mantém a IA indisponível quando só existem vozes desconhecidas', () => {
    const readiness = getDynamicAiVoiceReadiness([
      { speaker: 'Indefinido', text: 'Fala sem associação.', diarizationLabel: 'A' },
      { speaker: 'Indefinido', text: 'Outra voz.', diarizationLabel: 'B' },
    ], [])

    expect(readiness.canUseAi).toBe(false)
    expect(readiness.voices.map((voice) => voice.displayName)).toEqual([
      'Desconhecido 1',
      'Desconhecido 2',
    ])
  })

  it('apresenta relação contextual como citação, sem liberar autopreenchimento', () => {
    const contextualTurn = {
      speaker: 'Terceiro',
      text: 'Sou a mãe dele e observei febre durante a noite.',
      diarizationLabel: 'speaker_2',
      speakerDisplayName: 'Mãe do paciente',
      contextualRelation: 'Mãe do paciente',
      roleSource: 'automatico',
      roleConfidence: 0.94,
      sessionContextAuthorized: true,
    } as const
    const readiness = getDynamicAiVoiceReadiness([contextualTurn], [])

    expect(readiness.canUseAi).toBe(true)
    expect(readiness.unknownVoiceCount).toBe(0)
    expect(readiness.contextualTurnCount).toBe(1)
    expect(readiness.voices[0]?.displayName).toBe('Mãe do paciente')
    expect(readiness.voices[0]?.excludedFromAi).toBe(false)
    expect(getDynamicTurnAiUsage(contextualTurn, readiness.voices[0]!))
      .toBe('citacao_atribuida')
    expect(dynamicTurnCanFillPep(contextualTurn, readiness.voices[0]!)).toBe(false)
  })

  it('mantém voz ambígua disponível somente como sugestão de revisão obrigatória', () => {
    const ambiguousTurn = {
      speaker: 'Indefinido',
      text: 'Ele também reclamou de dor ontem.',
      diarizationLabel: 'speaker_3',
      roleSource: 'desconhecido',
      sessionReviewAuthorized: true,
    } as const
    const readiness = getDynamicAiVoiceReadiness([ambiguousTurn], [])

    expect(readiness.canUseAi).toBe(true)
    expect(readiness.reviewRequiredTurnCount).toBe(1)
    expect(readiness.unknownVoiceCount).toBe(1)
    expect(readiness.voices[0]?.excludedFromAi).toBe(false)
    expect(getDynamicTurnAiUsage(ambiguousTurn, readiness.voices[0]!))
      .toBe('revisao_obrigatoria')
    expect(dynamicTurnCanFillPep(ambiguousTurn, readiness.voices[0]!)).toBe(false)
  })

  it('associa turnos sem rótulo apenas por participante, papel ou relação segura', () => {
    const turns = [
      {
        speaker: 'Paciente',
        text: 'Primeira fala do paciente.',
        participantId: 'paciente-1',
        participantAuthorized: true,
      },
      {
        speaker: 'Paciente',
        text: 'Segunda fala do paciente.',
        participantId: 'paciente-1',
        participantAuthorized: true,
      },
      {
        speaker: 'Terceiro',
        text: 'Primeiro relato da mãe.',
        contextualRelation: 'Mãe do paciente',
        sessionContextAuthorized: true,
      },
      {
        speaker: 'Terceiro',
        text: 'Segundo relato da mae.',
        contextualRelation: 'Mae do paciente',
        sessionContextAuthorized: true,
      },
      {
        speaker: 'Indefinido',
        text: 'Primeira fala sem identidade.',
        sessionReviewAuthorized: true,
      },
      {
        speaker: 'Indefinido',
        text: 'Segunda fala sem identidade.',
        sessionReviewAuthorized: true,
      },
    ] as const

    expect(dynamicVoiceGroupKey(turns[0], 0)).toBe(dynamicVoiceGroupKey(turns[1], 1))
    expect(dynamicVoiceGroupKey(turns[2], 2)).toBe(dynamicVoiceGroupKey(turns[3], 3))
    expect(dynamicVoiceGroupKey(turns[4], 4)).not.toBe(dynamicVoiceGroupKey(turns[5], 5))

    const readiness = getDynamicAiVoiceReadiness([...turns], [])
    expect(readiness.voices).toHaveLength(4)
    expect(readiness.voices.map((voice) => voice.displayName)).toEqual([
      'Paciente',
      'Mãe do paciente',
      'Desconhecido 1',
      'Desconhecido 2',
    ])
    expect(readiness.voices.map((voice) => voice.turnCount)).toEqual([2, 2, 1, 1])
  })

  it('respeita a autorização vigente no momento da fala mesmo se o participante foi autorizado depois', () => {
    const patient = participant('paciente', 'paciente', true)
    const readiness = getDynamicAiVoiceReadiness([{
      speaker: 'Paciente',
      text: 'Fala anterior ao consentimento.',
      diarizationLabel: 'speaker_1',
      participantId: patient.id,
      participantAuthorized: false,
    }], [patient])

    expect(readiness.canUseAi).toBe(false)
    expect(readiness.voices[0]?.excludedFromAi).toBe(true)
  })

  it('avalia a autorização por fala sem excluir retroativamente trechos posteriores autorizados', () => {
    const patient = participant('paciente', 'paciente', true)
    const readiness = getDynamicAiVoiceReadiness([{
      speaker: 'Paciente',
      text: 'Fala anterior ao consentimento.',
      diarizationLabel: 'speaker_1',
      participantId: patient.id,
      participantAuthorized: false,
    }, {
      speaker: 'Paciente',
      text: 'Fala posterior ao consentimento.',
      diarizationLabel: 'speaker_1',
      participantId: patient.id,
      participantAuthorized: true,
    }], [patient])

    expect(readiness.canUseAi).toBe(true)
    expect(readiness.authorizedTurnCount).toBe(1)
    expect(readiness.excludedTurnCount).toBe(1)
    expect(readiness.voices[0]?.excludedFromAi).toBe(false)
    expect(readiness.voices[0]?.partiallyExcludedFromAi).toBe(true)
  })

  it('nunca apresenta rótulos técnicos de voz ao usuário', () => {
    expect(safeSpeakerDisplayName('speaker_0', 'identificada')).toBe('Voz identificada')
    expect(safeSpeakerDisplayName('speaker_A', 'identificada')).toBe('Voz identificada')
    expect(safeSpeakerDisplayName('A', 'identificada')).toBe('Voz identificada')
    expect(safeSpeakerDisplayName('Paciente', 'identificada')).toBe('Paciente')
  })

  it('trata desconhecidos excluídos como informativos e preserva bloqueios clínicos', () => {
    const item = (kind: string, blocksFinalization?: boolean) => ({
      kind,
      blocksFinalization,
    } as DynamicQuarantineItem)

    expect(dynamicQuarantineBlocksFinalization(item('falante_desconhecido'))).toBe(false)
    expect(dynamicQuarantineBlocksFinalization(item('falante_desconhecido_excluido'))).toBe(false)
    expect(dynamicQuarantineBlocksFinalization(item('voz_desconhecida_excluida'))).toBe(false)
    expect(dynamicQuarantineBlocksFinalization(item('irrelevante'))).toBe(false)
    expect(dynamicQuarantineBlocksFinalization(item('falante_nao_autorizado'))).toBe(true)
    expect(dynamicQuarantineBlocksFinalization(item('risco_clinico', false))).toBe(false)
  })
})
