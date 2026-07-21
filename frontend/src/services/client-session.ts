const CLINICAL_SESSION_STORAGE_PREFIXES = [
  'pep-consultation-draft:',
  'pep-clinical:',
  'pep-dynamic-consultation:',
] as const

export const SESSION_EXPIRED_EVENT = 'pep:session-expired'

/**
 * Remove apenas dados clínicos efêmeros. Preferências de interface ficam no
 * localStorage e não fazem parte desta limpeza.
 */
export function clearClinicalSessionStorage(storage?: Storage): void {
  const target = storage ?? (typeof window !== 'undefined' ? window.sessionStorage : undefined)
  if (!target) return

  const keysToRemove: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index)
    if (key && CLINICAL_SESSION_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => target.removeItem(key))
}

export function notifySessionExpired(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
}
