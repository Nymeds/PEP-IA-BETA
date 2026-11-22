import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'
import { SESSION_EXPIRED_EVENT } from './client-session'

describe('privacidade do cliente HTTP', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('desabilita o cache HTTP nas requisições autenticadas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        user: { id: 'user-1', email: 'psi@example.com', name: 'Psi', suggestedName: 'Psi' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.auth.me()

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ cache: 'no-store', credentials: 'include' })
    )
  })

  it('sinaliza 401 de rota privada, mas preserva o erro de credencial do login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: { get: () => null },
      json: async () => ({ error: 'Não autorizado' }),
    }))
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    await expect(api.auth.login({ email: 'psi@example.com', password: 'incorreta' }))
      .rejects.toBeInstanceOf(ApiError)
    expect(listener).not.toHaveBeenCalled()

    await expect(api.auth.me()).rejects.toBeInstanceOf(ApiError)
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })

  it('preserva o payload estruturado de conflito ao iniciar uma consulta', async () => {
    const payload = {
      error: 'Já existe outra consulta em andamento para este médico',
      code: 'ACTIVE_CONSULTATION_EXISTS',
      activeConsultation: {
        id: 'consulta-ativa',
        patientName: 'Paciente em atendimento',
        startedAt: '2026-07-22T22:42:44.359Z',
        scheduleTitle: 'Agenda Clínica Geral',
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      statusText: 'Conflict',
      headers: { get: () => 'request-409' },
      json: async () => payload,
    }))

    const error = await api.consultations.start('consulta-em-espera').catch((reason) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 409,
      code: 'ACTIVE_CONSULTATION_EXISTS',
      requestId: 'request-409',
      payload,
    })
  })
})
