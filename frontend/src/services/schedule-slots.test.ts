import { describe, expect, it } from 'vitest'
import type { ScheduleSlot } from '@/types'
import { isSelectedScheduleSlotAvailable } from './schedule-slots'

function slot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    shiftId: 'manha',
    shiftLabel: 'Manhã',
    label: '09:00',
    localDateTime: '2040-01-02T09:00',
    isoDateTime: '2040-01-02T12:00:00.000Z',
    available: true,
    unavailableReason: null,
    appointment: null,
    ...overrides,
  }
}

describe('isSelectedScheduleSlotAvailable', () => {
  it('aceita somente um horário que ainda existe e permanece disponível', () => {
    const selected = '2040-01-02T12:00:00.000Z'

    expect(isSelectedScheduleSlotAvailable([slot()], selected)).toBe(true)
    expect(isSelectedScheduleSlotAvailable([
      slot({ available: false, unavailableReason: 'horario_passado' }),
    ], selected)).toBe(false)
    expect(isSelectedScheduleSlotAvailable([
      slot({ available: false, unavailableReason: 'capacidade_esgotada' }),
    ], selected)).toBe(false)
    expect(isSelectedScheduleSlotAvailable([slot()], '2040-01-02T12:30:00.000Z')).toBe(false)
  })

  it('mantém o envio bloqueado enquanto a lista ainda não foi carregada', () => {
    expect(isSelectedScheduleSlotAvailable(undefined, '2040-01-02T12:00:00.000Z')).toBe(false)
    expect(isSelectedScheduleSlotAvailable([slot()], '')).toBe(false)
  })
})
