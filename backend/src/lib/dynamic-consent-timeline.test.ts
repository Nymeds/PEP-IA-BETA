import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ConsentTimelineEvent,
  consentWasGrantedAt,
  estimateDialogueTurnOccurredAt,
} from './dynamic-consent-timeline'

const at = (minute: number, second = 0) =>
  new Date(Date.UTC(2040, 0, 2, 12, minute, second))

function participation(
  participantId: string,
  granted: boolean,
  recordedAt: Date,
  revokedAt: Date | null = null
): ConsentTimelineEvent {
  return {
    type: 'participacao',
    participantId,
    granted,
    recordedAt,
    revokedAt,
  }
}

test('concessao posterior nao autoriza uma fala retroativamente', () => {
  const events = [participation('paciente', true, at(10))]

  assert.equal(
    consentWasGrantedAt(events, {
      type: 'participacao',
      participantId: 'paciente',
    }, at(5)),
    false
  )
  assert.equal(
    consentWasGrantedAt(events, {
      type: 'participacao',
      participantId: 'paciente',
    }, at(11)),
    true
  )
})

test('usa a decisao vigente entre concessao e revogacao sem depender da ordem', () => {
  const events = [
    participation('paciente', true, at(20)),
    participation('paciente', false, at(10)),
    participation('paciente', true, at(0)),
  ]

  assert.equal(
    consentWasGrantedAt(events, {
      type: 'participacao',
      participantId: 'paciente',
    }, at(5)),
    true
  )
  assert.equal(
    consentWasGrantedAt(events, {
      type: 'participacao',
      participantId: 'paciente',
    }, at(15)),
    false
  )
  assert.equal(
    consentWasGrantedAt(events, {
      type: 'participacao',
      participantId: 'paciente',
    }, at(25)),
    true
  )
})

test('revokedAt encerra a concessao somente a partir da revogacao', () => {
  const events = [participation('acompanhante', true, at(0), at(10))]
  const selector = {
    type: 'participacao',
    participantId: 'acompanhante',
  }

  assert.equal(consentWasGrantedAt(events, selector, at(9, 59)), true)
  assert.equal(consentWasGrantedAt(events, selector, at(10)), false)
})

test('estima o instante do turno somando seu offset ao inicio da consulta', () => {
  assert.deepEqual(
    estimateDialogueTurnOccurredAt({
      startedAt: at(0),
      turnStartSeconds: 125.4,
      audioSavedAt: at(10),
    }),
    new Date(Date.UTC(2040, 0, 2, 12, 2, 5, 400))
  )
})

test('nao usa o fim do audio como base quando o offset esta ausente ou invalido', () => {
  assert.deepEqual(
    estimateDialogueTurnOccurredAt({
      startedAt: at(0),
      audioSavedAt: at(30),
    }),
    at(0)
  )
  assert.deepEqual(
    estimateDialogueTurnOccurredAt({
      startedAt: at(0),
      turnStartSeconds: 100_000,
      audioSavedAt: at(30),
    }),
    at(0)
  )
})

test('sem inicio confiavel nao fabrica um instante que possa conceder consentimento', () => {
  assert.equal(
    estimateDialogueTurnOccurredAt({
      startedAt: null,
      turnStartSeconds: 30,
      audioSavedAt: at(10),
    }),
    null
  )
})
