import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getScheduleSlotUnavailableReason,
  isScheduleSlotInPast,
  SCHEDULE_PAST_TOLERANCE_MS,
} from './schedule'

test('horario passado usa a mesma tolerancia da confirmacao do agendamento', () => {
  const now = new Date('2040-01-02T12:00:00.000Z')

  assert.equal(
    isScheduleSlotInPast(
      new Date(now.getTime() - SCHEDULE_PAST_TOLERANCE_MS - 1),
      now
    ),
    true
  )
  assert.equal(
    isScheduleSlotInPast(
      new Date(now.getTime() - SCHEDULE_PAST_TOLERANCE_MS),
      now
    ),
    false
  )
  assert.equal(isScheduleSlotInPast('2040-01-02T12:30:00.000Z', now), false)
})

test('horario invalido nunca e apresentado como agendavel', () => {
  assert.equal(isScheduleSlotInPast('data-invalida', Date.now()), true)
})

test('capacidade diaria esgotada bloqueia vagas futuras ainda vazias', () => {
  const now = new Date('2040-01-02T12:00:00.000Z')

  assert.equal(getScheduleSlotUnavailableReason({
    isoDateTime: '2040-01-02T13:00:00.000Z',
    hasAppointment: false,
    dailyCapacityReached: true,
    now,
  }), 'capacidade_esgotada')
  assert.equal(getScheduleSlotUnavailableReason({
    isoDateTime: '2040-01-02T13:00:00.000Z',
    hasAppointment: false,
    dailyCapacityReached: false,
    now,
  }), null)
  assert.equal(getScheduleSlotUnavailableReason({
    isoDateTime: '2040-01-02T13:00:00.000Z',
    hasAppointment: true,
    dailyCapacityReached: true,
    now,
  }), 'horario_ocupado')
})
