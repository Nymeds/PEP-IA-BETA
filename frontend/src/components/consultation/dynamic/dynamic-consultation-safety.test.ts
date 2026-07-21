import { describe, expect, it } from 'vitest'
import type {
  DynamicConsent,
  DynamicConsultationRuntime,
  DynamicParticipant,
} from '@/types/forms'
import { isDynamicRecordingReady } from './DynamicPreparationPanel'
import { areDynamicVoicesReady } from './DynamicConsultationView'

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

    patient.authorized = true
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
    ], [
      participant('profissional', 'profissional', true),
      participant('paciente', 'paciente', true),
      participant('responsavel', 'responsavel', true),
    ]))).toBe(true)
  })

  it('não libera a IA clínica enquanto uma voz estiver desconhecida ou não autorizada', () => {
    const participants = [
      participant('profissional', 'profissional', true, 'speaker_0'),
      participant('paciente', 'paciente', false, 'speaker_1'),
    ]

    expect(areDynamicVoicesReady([
      { diarizationLabel: 'speaker_0' },
      { diarizationLabel: 'speaker_1' },
    ], participants)).toBe(false)

    participants[1].authorized = true
    expect(areDynamicVoicesReady([
      { diarizationLabel: 'speaker_0' },
      {},
    ], participants)).toBe(false)

    expect(areDynamicVoicesReady([
      { diarizationLabel: 'speaker_0' },
      { diarizationLabel: 'speaker_1' },
    ], participants)).toBe(true)
  })
})
