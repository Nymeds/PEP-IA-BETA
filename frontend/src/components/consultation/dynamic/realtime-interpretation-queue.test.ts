import { describe, expect, it, vi } from 'vitest'
import { createRealtimeInterpretationQueue } from './realtime-interpretation-queue'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolver) => {
    resolve = resolver
  })
  return { promise, resolve }
}

describe('createRealtimeInterpretationQueue', () => {
  it('agrupa transcrições próximas antes de iniciar a IA', async () => {
    vi.useFakeTimers()
    const interpret = vi.fn().mockResolvedValue({ updates: 2 })
    const queue = createRealtimeInterpretationQueue({
      debounceMs: 400,
      interpret,
      onApplied: vi.fn(),
    })

    queue.request()
    queue.request()
    await vi.advanceTimersByTimeAsync(399)
    expect(interpret).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await queue.flush()
    expect(interpret).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('agrupa novos segmentos e nunca executa duas interpretações em paralelo', async () => {
    const first = deferred<number>()
    const second = deferred<number>()
    const interpret = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const onApplied = vi.fn()
    const queue = createRealtimeInterpretationQueue({ interpret, onApplied })

    queue.request()
    queue.request()

    expect(interpret).toHaveBeenCalledTimes(1)
    first.resolve(1)
    await Promise.resolve()
    await Promise.resolve()

    expect(interpret).toHaveBeenCalledTimes(2)
    second.resolve(2)
    await queue.flush()

    expect(onApplied).toHaveBeenNthCalledWith(1, 1)
    expect(onApplied).toHaveBeenNthCalledWith(2, 2)
  })

  it('volta a processar quando chega uma transcrição depois de um erro', async () => {
    const error = new Error('indisponível')
    const interpret = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ updates: 1 })
    const onApplied = vi.fn()
    const onError = vi.fn()
    const queue = createRealtimeInterpretationQueue({ interpret, onApplied, onError })

    queue.request()
    await queue.flush()
    expect(onError).toHaveBeenCalledWith(error)

    queue.request()
    await queue.flush()

    expect(interpret).toHaveBeenCalledTimes(2)
    expect(onApplied).toHaveBeenCalledWith({ updates: 1 })
  })

  it('ignora resultados concluídos depois que a fila é descartada', async () => {
    const pending = deferred<string>()
    const onApplied = vi.fn()
    const queue = createRealtimeInterpretationQueue({
      interpret: () => pending.promise,
      onApplied,
    })

    queue.request()
    queue.dispose()
    pending.resolve('resultado antigo')
    await Promise.resolve()
    await Promise.resolve()

    expect(onApplied).not.toHaveBeenCalled()
  })
})
