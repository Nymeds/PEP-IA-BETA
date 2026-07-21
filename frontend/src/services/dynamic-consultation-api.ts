import { ApiError, BASE } from './api'
import { notifySessionExpired } from './client-session'
import type {
  ClinicalDocumentFormat,
  ClinicalDocumentKind,
  ConsultationRuntimeResponse,
  DynamicConsent,
  DynamicConsentType,
  DynamicConsultationRuntime,
  DynamicDiarizationResult,
  DynamicFieldUpdateResult,
  DynamicFormVersionChangeResult,
  DynamicFormVersionPreview,
  DynamicGeneratedContent,
  DynamicGeneratedDocument,
  DynamicMedicationReference,
  DynamicParticipant,
  DynamicQuarantineItem,
  MedicationReference,
} from '@/types/forms'

interface DynamicRequestOptions extends RequestInit {
  timeoutMs?: number
}

async function parseError(response: Response): Promise<never> {
  if (response.status === 401) notifySessionExpired()
  const body = await response.json().catch(() => ({ error: response.statusText }))
  throw new ApiError(
    body.message || body.error || 'Não foi possível concluir a solicitação',
    response.status,
    { code: body.code, requestId: response.headers.get('x-request-id') || body.requestId }
  )
}

async function request<T>(path: string, options: DynamicRequestOptions = {}): Promise<T> {
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
    const response = await fetch(`${BASE}${path}`, {
      ...fetchOptions,
      cache: 'no-store',
      credentials: 'include',
      headers,
      signal: controller.signal,
    })
    if (!response.ok) return parseError(response)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof ApiError)) {
      throw new ApiError('A solicitação demorou mais que o esperado', 408)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }
}

export const dynamicConsultationApi = {
  runtime: (consultationId: string) =>
    request<ConsultationRuntimeResponse>(`/api/consultations/${consultationId}/runtime`),

  previewFormVersion: (consultationId: string, versionId: string) =>
    request<DynamicFormVersionPreview>(`/api/consultations/${consultationId}/form-version`, {
      method: 'POST',
      body: JSON.stringify({ versionId, preview: true }),
    }),

  changeFormVersion: (
    consultationId: string,
    versionId: string,
    suppressWarning: boolean
  ) =>
    request<DynamicFormVersionChangeResult>(
      `/api/consultations/${consultationId}/form-version`,
      { method: 'POST', body: JSON.stringify({ versionId, suppressWarning }) }
    ),

  updateFields: (
    consultationId: string,
    data: {
      documentKind: ClinicalDocumentKind
      changes: Array<{ fieldId: string; value: unknown; expectedRevision?: number }>
      reason?: string
    }
  ) =>
    request<DynamicConsultationRuntime>(`/api/consultations/${consultationId}/dynamic-fields`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  addParticipant: (
    consultationId: string,
    data: { name: string; role: string; speakerLabel?: string | null }
  ) =>
    request<DynamicParticipant>(`/api/consultations/${consultationId}/participants`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateParticipant: (
    consultationId: string,
    participantId: string,
    data: Partial<Pick<DynamicParticipant, 'name' | 'role' | 'speakerLabel' | 'active'>>
  ) =>
    request<DynamicParticipant>(
      `/api/consultations/${consultationId}/participants/${participantId}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  recordConsent: (
    consultationId: string,
    data: {
      type: DynamicConsentType
      granted: boolean
      participantId?: string
      evidence?: Record<string, unknown>
    }
  ) =>
    request<DynamicConsent>(`/api/consultations/${consultationId}/consents`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  reinterpret: (consultationId: string, force = false) =>
    request<DynamicFieldUpdateResult>(
      `/api/consultations/${consultationId}/dynamic-reinterpret`,
      { method: 'POST', body: JSON.stringify({ force }), timeoutMs: 120_000 }
    ),

  diarize: (consultationId: string) =>
    request<DynamicDiarizationResult>(`/api/consultations/${consultationId}/diarize`, {
      method: 'POST',
      timeoutMs: 180_000,
    }),

  topics: (consultationId: string) =>
    request<{ topics: import('@/types/forms').DynamicConversationTopic[] }>(
      `/api/consultations/${consultationId}/topics`
    ),

  generateDocument: (
    consultationId: string,
    data: {
      format: ClinicalDocumentFormat
      documentKind: ClinicalDocumentKind
      manualContent?: DynamicGeneratedContent
    }
  ) =>
    request<DynamicGeneratedDocument>(
      `/api/consultations/${consultationId}/generated-documents`,
      { method: 'POST', body: JSON.stringify(data), timeoutMs: 180_000 }
    ),

  confirmDocument: (
    consultationId: string,
    documentId: string,
    content: DynamicGeneratedContent | Record<string, unknown>,
    reason?: string
  ) =>
    request<DynamicGeneratedDocument>(
      `/api/consultations/${consultationId}/generated-documents/${documentId}/confirm`,
      { method: 'PATCH', body: JSON.stringify({ content, reason }) }
    ),

  resolveQuarantine: (
    consultationId: string,
    itemId: string,
    data:
      | { action: 'dismiss' }
      | {
          action: 'restore'
          fieldId: string
          documentKind: ClinicalDocumentKind
          value: unknown
        }
  ) =>
    request<DynamicQuarantineItem>(
      `/api/consultations/${consultationId}/quarantine/${itemId}`,
      { method: 'PATCH', body: JSON.stringify(data) }
    ),

  medicationReference: (consultationId: string, name: string) =>
    request<MedicationReference>(`/api/consultations/${consultationId}/medication-reference`, {
      method: 'POST',
      body: JSON.stringify({ name }),
      timeoutMs: 120_000,
    }),

  reviewMedicationReference: (
    consultationId: string,
    referenceId: string,
    action: 'accept' | 'dismiss'
  ) =>
    request<DynamicMedicationReference>(
      `/api/consultations/${consultationId}/medication-reference/${referenceId}`,
      { method: 'PATCH', body: JSON.stringify({ action }) }
    ),

  async exportDocument(consultationId: string, kind: ClinicalDocumentKind) {
    const response = await fetch(`${BASE}/api/consultations/${consultationId}/export/${kind}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) return parseError(response)
    const disposition = response.headers.get('content-disposition') || ''
    const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ||
      `consulta-${consultationId}-${kind}.json`
    return { blob: await response.blob(), filename }
  },
}
