import { isBrazilHoliday } from './holidays'

export const SCHEDULE_STATUS = {
  ACTIVE: 'ativa',
  INACTIVE: 'inativa',
} as const

export const CONSULTATION_STATUS = {
  WAITING: 'em_espera',
  IN_PROGRESS: 'em_consulta',
  FINISHED: 'finalizado',
} as const

export type ScheduleStatus = (typeof SCHEDULE_STATUS)[keyof typeof SCHEDULE_STATUS]
export type ConsultationStatus =
  (typeof CONSULTATION_STATUS)[keyof typeof CONSULTATION_STATUS]

export interface ShiftConfig {
  id: string
  label: string
  enabled: boolean
  start: string
  end: string
  slots: number
}

export interface NormalizedScheduleSettings {
  activeWeekDays: number[]
  workOnHolidays: boolean
  appointmentDurationMinutes: number
  shifts: ShiftConfig[]
}

export interface GeneratedSlot {
  shiftId: string
  shiftLabel: string
  label: string
  localDateTime: string
  isoDateTime: string
}

interface PersistedScheduleSettings {
  activeWeekDaysJson: string
  workOnHolidays: boolean
  appointmentDurationMinutes: number
  shiftsJson: string
}

const DEFAULT_SHIFTS: ShiftConfig[] = [
  { id: 'manha', label: 'Manhã', enabled: true, start: '08:00', end: '12:00', slots: 8 },
  { id: 'tarde', label: 'Tarde', enabled: true, start: '13:00', end: '17:00', slots: 8 },
  { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 6 },
]

const DEFAULT_SETTINGS: NormalizedScheduleSettings = {
  activeWeekDays: [1, 2, 3, 4, 5],
  workOnHolidays: false,
  appointmentDurationMinutes: 30,
  shifts: DEFAULT_SHIFTS,
}

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function formatLocalDateTime(date: Date): string {
  return `${formatLocalDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseWeekDays(value?: string | null): number[] {
  try {
    const parsed = JSON.parse(value || '') as unknown
    if (!Array.isArray(parsed)) return DEFAULT_SETTINGS.activeWeekDays

    const weekDays = parsed
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)

    return Array.from(new Set(weekDays)).sort((a, b) => a - b)
  } catch {
    return DEFAULT_SETTINGS.activeWeekDays
  }
}

function normalizeShifts(value?: unknown, options?: { preserveEmpty?: boolean }): ShiftConfig[] {
  const source = Array.isArray(value) ? value : DEFAULT_SHIFTS

  const shifts = source
    .map((item, index) => {
      const raw = (item || {}) as Partial<ShiftConfig>
      return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : DEFAULT_SHIFTS[index]?.id || `turno-${index + 1}`,
        label:
          typeof raw.label === 'string' && raw.label.trim()
            ? raw.label.trim()
            : DEFAULT_SHIFTS[index]?.label || `Turno ${index + 1}`,
        enabled: Boolean(raw.enabled),
        start: typeof raw.start === 'string' && isTime(raw.start) ? raw.start : DEFAULT_SHIFTS[index]?.start || '08:00',
        end: typeof raw.end === 'string' && isTime(raw.end) ? raw.end : DEFAULT_SHIFTS[index]?.end || '12:00',
        slots: Math.max(0, Math.min(24, Number(raw.slots) || 0)),
      }
    })
    .filter((shift) => shift.id && shift.label)

  if (options?.preserveEmpty && Array.isArray(value) && value.length === 0) {
    return []
  }

  return shifts.length ? shifts : DEFAULT_SHIFTS
}

function parseShifts(value?: string | null): ShiftConfig[] {
  try {
    const parsed = JSON.parse(value || '') as unknown
    return normalizeShifts(parsed)
  } catch {
    return DEFAULT_SHIFTS
  }
}

export function normalizeScheduleStatus(status?: string | null): ScheduleStatus {
  return status === SCHEDULE_STATUS.INACTIVE ? SCHEDULE_STATUS.INACTIVE : SCHEDULE_STATUS.ACTIVE
}

export function normalizeConsultationStatus(status?: string | null): ConsultationStatus {
  if (status === 'scheduled') return CONSULTATION_STATUS.WAITING
  if (status === 'active') return CONSULTATION_STATUS.IN_PROGRESS
  if (status === 'completed') return CONSULTATION_STATUS.FINISHED
  if (status === CONSULTATION_STATUS.IN_PROGRESS) return CONSULTATION_STATUS.IN_PROGRESS
  if (status === CONSULTATION_STATUS.FINISHED) return CONSULTATION_STATUS.FINISHED
  return CONSULTATION_STATUS.WAITING
}

export function getDefaultSettingsPayload() {
  return {
    activeWeekDaysJson: JSON.stringify(DEFAULT_SETTINGS.activeWeekDays),
    workOnHolidays: DEFAULT_SETTINGS.workOnHolidays,
    appointmentDurationMinutes: DEFAULT_SETTINGS.appointmentDurationMinutes,
    shiftsJson: JSON.stringify(DEFAULT_SETTINGS.shifts),
  }
}

export function normalizeScheduleSettings(
  input?: Partial<NormalizedScheduleSettings> | null
): NormalizedScheduleSettings {
  const inputWeekDays =
    input?.activeWeekDays === undefined ? DEFAULT_SETTINGS.activeWeekDays : input.activeWeekDays

  const activeWeekDays = Array.from(
    new Set((inputWeekDays || []).filter((day) => day >= 0 && day <= 6))
  ).sort((a, b) => a - b)

  const shifts =
    input?.shifts === undefined
      ? normalizeShifts(undefined)
      : normalizeShifts(input.shifts, { preserveEmpty: true })
  const appointmentDurationMinutes = Math.max(
    10,
    Math.min(180, Number(input?.appointmentDurationMinutes) || DEFAULT_SETTINGS.appointmentDurationMinutes)
  )

  const normalized: NormalizedScheduleSettings = {
    activeWeekDays,
    workOnHolidays: Boolean(input?.workOnHolidays),
    appointmentDurationMinutes,
    shifts,
  }

  validateScheduleSettings(normalized)
  return normalized
}

export function fromPrismaScheduleSettings(
  settings?: PersistedScheduleSettings | null
): NormalizedScheduleSettings {
  return normalizeScheduleSettings({
    activeWeekDays: parseWeekDays(settings?.activeWeekDaysJson),
    workOnHolidays: settings?.workOnHolidays ?? DEFAULT_SETTINGS.workOnHolidays,
    appointmentDurationMinutes:
      settings?.appointmentDurationMinutes ?? DEFAULT_SETTINGS.appointmentDurationMinutes,
    shifts: parseShifts(settings?.shiftsJson),
  })
}

export function toPrismaScheduleSettings(input: NormalizedScheduleSettings) {
  return {
    activeWeekDaysJson: JSON.stringify(input.activeWeekDays),
    workOnHolidays: input.workOnHolidays,
    appointmentDurationMinutes: input.appointmentDurationMinutes,
    shiftsJson: JSON.stringify(input.shifts),
  }
}

export function validateScheduleSettings(settings: NormalizedScheduleSettings) {
  if (!settings.activeWeekDays.length) {
    throw new Error('Selecione ao menos um dia da semana para atendimento')
  }

  if (!settings.shifts.some((shift) => shift.enabled && shift.slots > 0)) {
    throw new Error('Ative ao menos um turno com vagas disponiveis')
  }

  for (const shift of settings.shifts) {
    if (!isTime(shift.start) || !isTime(shift.end)) {
      throw new Error(`Horario invalido no turno ${shift.label}`)
    }

    if (shift.enabled && shift.slots <= 0) {
      throw new Error(`Informe ao menos uma vaga no turno ${shift.label}`)
    }

    const startMinutes = toMinutes(shift.start)
    const endMinutes = toMinutes(shift.end)
    const durationNeeded = shift.slots * settings.appointmentDurationMinutes

    if (endMinutes <= startMinutes) {
      throw new Error(`O horario final do turno ${shift.label} precisa ser maior que o inicial`)
    }

    if (shift.enabled && durationNeeded > endMinutes - startMinutes) {
      throw new Error(
        `O turno ${shift.label} nao comporta ${shift.slots} vaga(s) com ${settings.appointmentDurationMinutes} minuto(s)`
      )
    }
  }
}

export function getEnabledShiftCount(settings: NormalizedScheduleSettings): number {
  return settings.shifts.filter((shift) => shift.enabled && shift.slots > 0).length
}

export function getMaxAppointmentsPerDay(settings: NormalizedScheduleSettings): number {
  return settings.shifts
    .filter((shift) => shift.enabled && shift.slots > 0)
    .reduce((total, shift) => total + shift.slots, 0)
}

export function getDateAvailability(
  date: Date,
  settings: NormalizedScheduleSettings,
  options?: { scheduleStatus?: string | null }
): { allowed: boolean; reason?: string; isHoliday: boolean } {
  const weekDay = date.getDay()
  const isHoliday = isBrazilHoliday(date)

  if (
    options?.scheduleStatus &&
    normalizeScheduleStatus(options.scheduleStatus) === SCHEDULE_STATUS.INACTIVE
  ) {
    return {
      allowed: false,
      reason: 'A agenda selecionada esta inativa',
      isHoliday,
    }
  }

  if (!settings.activeWeekDays.includes(weekDay)) {
    return {
      allowed: false,
      reason: 'O medico nao atende neste dia da semana conforme a agenda configurada',
      isHoliday,
    }
  }

  if (isHoliday && !settings.workOnHolidays) {
    return {
      allowed: false,
      reason: 'A agenda atual nao permite atendimento em feriados',
      isHoliday,
    }
  }

  return { allowed: true, isHoliday }
}

export function generateSlotsForDate(
  dateString: string,
  settings: NormalizedScheduleSettings
): GeneratedSlot[] {
  return settings.shifts
    .filter((shift) => shift.enabled && shift.slots > 0)
    .flatMap((shift) => {
      const slots: GeneratedSlot[] = []
      const [startHour, startMinute] = shift.start.split(':').map(Number)
      const start = new Date(`${dateString}T00:00:00`)
      start.setHours(startHour, startMinute, 0, 0)

      for (let index = 0; index < shift.slots; index += 1) {
        const slotDate = new Date(start)
        slotDate.setMinutes(slotDate.getMinutes() + settings.appointmentDurationMinutes * index)

        const slotLabel = slotDate.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        })

        slots.push({
          shiftId: shift.id,
          shiftLabel: shift.label,
          label: slotLabel,
          localDateTime: formatLocalDateTime(slotDate),
          isoDateTime: slotDate.toISOString(),
        })
      }

      return slots
    })
}
