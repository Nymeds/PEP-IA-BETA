interface RealtimeInterpretationQueueOptions<TResult> {
  interpret: () => Promise<TResult>
  onApplied: (result: TResult) => Promise<void> | void
  onError?: (error: unknown) => void
  onBusyChange?: (busy: boolean) => void
  debounceMs?: number
}

export interface RealtimeInterpretationQueue {
  request: () => void
  flush: () => Promise<void>
  dispose: () => void
}

/**
 * Serializa a interpretação incremental sem perder transcrições que chegam
 * enquanto uma chamada de IA ainda está em andamento.
 *
 * Pedidos simultâneos são agrupados: ao terminar a execução atual, uma nova
 * rodada processa todos os segmentos que foram persistidos nesse intervalo.
 */
export function createRealtimeInterpretationQueue<TResult>(
  options: RealtimeInterpretationQueueOptions<TResult>
): RealtimeInterpretationQueue {
  let requestedVersion = 0
  let processedVersion = 0
  let active: Promise<void> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const run = async () => {
    options.onBusyChange?.(true)
    try {
      while (!disposed && processedVersion < requestedVersion) {
        const targetVersion = requestedVersion
        try {
          const result = await options.interpret()
          if (disposed) return
          await options.onApplied(result)
        } catch (error) {
          if (!disposed) options.onError?.(error)
        } finally {
          processedVersion = targetVersion
        }
      }
    } finally {
      active = null
      if (!disposed) options.onBusyChange?.(false)
    }
  }

  const start = () => {
    if (disposed || active || processedVersion >= requestedVersion) return
    active = run()
  }

  const schedule = () => {
    if (disposed || active) return
    if (debounceTimer) clearTimeout(debounceTimer)
    const delay = Math.max(0, options.debounceMs || 0)
    if (!delay) {
      start()
      return
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      start()
    }, delay)
  }

  return {
    request() {
      if (disposed) return
      requestedVersion += 1
      schedule()
    },
    async flush() {
      if (disposed) return
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      start()
      while (active) {
        await active
        start()
      }
    },
    dispose() {
      disposed = true
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    },
  }
}
