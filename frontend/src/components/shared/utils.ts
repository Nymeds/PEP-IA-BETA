export function format(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function calcAge(birthDate?: string): string {
  if (!birthDate) return '—'
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${age} anos`
}

export function parseJson<T>(str?: string | null, fallback: T = [] as unknown as T): T {
  if (!str) return fallback
  try {
    return JSON.parse(str) as T
  } catch {
    return fallback
  }
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
