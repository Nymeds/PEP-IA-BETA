import { ApiError, BASE } from './api'

export interface AgendaFormOption {
  id: string
  name: string
  specialtyCode: string
  status: string
  isDefault: boolean
  latestVersion: {
    id: string
    version: number
    publishedAt: string | null
  } | null
}

interface AgendaFormOptionsResponse {
  items: AgendaFormOption[]
}

async function parseError(response: Response): Promise<never> {
  const payload = await response.json().catch(() => ({ error: response.statusText }))
  throw new ApiError(
    payload.message || payload.error || 'Não foi possível carregar os formulários publicados',
    response.status
  )
}

export async function listPublishedAgendaForms(specialtyCode: string) {
  const query = new URLSearchParams({ specialtyCode, status: 'publicado' })
  const response = await fetch(`${BASE}/api/form-templates?${query.toString()}`, {
    credentials: 'include',
  })

  if (!response.ok) await parseError(response)

  const payload = (await response.json()) as AgendaFormOptionsResponse
  return (payload.items || []).filter((item) => item.status === 'publicado' && item.latestVersion)
}
