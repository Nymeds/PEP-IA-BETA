'use client'

import { useCallback, useEffect, useState } from 'react'

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored != null) setValue(JSON.parse(stored) as T)
    } catch {
      // Prefer the in-memory default when storage is unavailable or malformed.
    }
  }, [key])

  const setPersistentValue = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === 'function'
          ? (next as (current: T) => T)(current)
          : next
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved))
        } catch {
          // The current session remains usable even when storage is full or blocked.
        }
        return resolved
      })
    },
    [key]
  )

  return [value, setPersistentValue] as const
}
