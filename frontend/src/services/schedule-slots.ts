import type { ScheduleSlot } from '@/types'

export function isSelectedScheduleSlotAvailable(
  slots: ScheduleSlot[] | undefined,
  selectedSlot: string
): boolean {
  if (!selectedSlot || !slots) return false
  return slots.some((slot) => slot.isoDateTime === selectedSlot && slot.available)
}
