import type {
  CreateFormTemplateInput,
  FormTemplateListResponse,
  FormTemplateResponse,
  FormTemplateStatus,
  FormVersionListResponse,
  UpdateFormTemplateInput,
} from '@/types/forms'
import { notifySessionExpired } from './client-session'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export class FormsApiError extends Error {
  status: number
  code?: string
  requestId?: string

  constructor(message: string, status: number, code?: string, requestId?: string) {
    super(message)
    this.name = 'FormsApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

interface FormsRequestOptions extends RequestInit {
  timeoutMs?: number
}

function buildUrl(path: string, query?: Record<string, string | undefined>) {
  const url = new URL(`${BASE}${path}`)
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value)
  })
  return url.toString()
}

async function request<T>(
  path: string,
  options: FormsRequestOptions = {},
  query?: Record<string, string | undefined>
): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs || 30_000)
  const externalSignal = options.signal
  const abortFromExternal = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options
    void _timeoutMs
    const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
    if (options.body) headers['Content-Type'] = 'application/json'
    const response = await fetch(buildUrl(path, query), {
      ...fetchOptions,
      cache: 'no-store',
      credentials: 'include',
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      if (response.status === 401) notifySessionExpired()
      const body = await response.json().catch(() => ({ error: response.statusText }))
      throw new FormsApiError(
        body.message || body.error || 'Não foi possível concluir a solicitação.',
        response.status,
        body.code,
        response.headers.get('x-request-id') || body.requestId
      )
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof FormsApiError)) {
      throw new FormsApiError('A solicitação demorou mais que o esperado.', 408)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
}

export const formsApi = {
  list: (status?: FormTemplateStatus | 'all') =>
    request<FormTemplateListResponse>('/api/form-templates', {}, {
      status: status && status !== 'all' ? status : undefined,
    }),
  get: (id: string) => request<FormTemplateResponse>(`/api/form-templates/${id}`),
  create: (data: CreateFormTemplateInput) =>
    request<FormTemplateResponse>('/api/form-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: string, data: UpdateFormTemplateInput, signal?: AbortSignal) =>
    request<FormTemplateResponse>(`/api/form-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
      signal,
    }),
  copy: (id: string, name?: string) =>
    request<FormTemplateResponse>(`/api/form-templates/${id}/copy`, {
      method: 'POST',
      body: name ? JSON.stringify({ name }) : undefined,
    }),
  publish: (id: string) =>
    request<FormTemplateResponse>(`/api/form-templates/${id}/publish`, { method: 'POST' }),
  setDefault: (id: string) =>
    request<FormTemplateResponse>(`/api/form-templates/${id}/default`, { method: 'POST' }),
  archive: (id: string) =>
    request<FormTemplateResponse>(`/api/form-templates/${id}/archive`, { method: 'POST' }),
  versions: (id: string) =>
    request<FormVersionListResponse>(`/api/form-templates/${id}/versions`),
}
