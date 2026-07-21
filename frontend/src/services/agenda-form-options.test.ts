import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api'
import { listPublishedAgendaForms } from './agenda-form-options'

describe('listPublishedAgendaForms', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('consulta a especialidade e mantém apenas versões publicadas utilizáveis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'form-1',
            name: 'Psicologia essencial',
            specialtyCode: 'psicologia',
            status: 'publicado',
            isDefault: true,
            latestVersion: { id: 'version-1', version: 2, publishedAt: null },
          },
          {
            id: 'form-2',
            name: 'Rascunho',
            specialtyCode: 'psicologia',
            status: 'rascunho',
            isDefault: false,
            latestVersion: null,
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await listPublishedAgendaForms('psicologia')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('form-1')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/form-templates?specialtyCode=psicologia&status=publicado'),
      { credentials: 'include' }
    )
  })

  it('expõe erro de API sem quebrar o contrato de autenticação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Unavailable',
        json: async () => ({ error: 'Serviço temporariamente indisponível' }),
      })
    )

    await expect(listPublishedAgendaForms('psicologia')).rejects.toBeInstanceOf(ApiError)
  })
})
