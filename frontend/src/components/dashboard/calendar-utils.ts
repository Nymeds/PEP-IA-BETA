export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function monthToInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

export function dateToInput(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseMonthInput(month: string) {
  const [year, monthValue] = month.split('-').map(Number)
  return new Date(year, monthValue - 1, 1)
}

export function buildMonthGrid(month: string) {
  const monthDate = parseMonthInput(month)
  const start = new Date(monthDate)
  start.setDate(1)
  start.setDate(start.getDate() - start.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return {
      date: day,
      key: dateToInput(day),
      isCurrentMonth: day.getMonth() === monthDate.getMonth(),
      isToday: dateToInput(day) === dateToInput(new Date()),
    }
  })
}

export function shiftMonth(month: string, offset: number) {
  const date = parseMonthInput(month)
  date.setMonth(date.getMonth() + offset)
  return monthToInput(date)
}

export function formatMonthHeading(month: string) {
  return parseMonthInput(month).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatDateTimeLabel(value?: string | null) {
  if (!value) return 'Sem horario'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateHeading(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}
