import {
  AuthUser,
  CalendarAppointment,
  Consultation,
  ClinicalTemplateId,
  ConsultationVersion,
  ConversationTopic,
  DeltaExtractionResult,
  ExtractedData,
  FieldProvenance,
  ClinicalSuggestion,
  FinalizeResponse,
  Patient,
  PatientListResponse,
  PatientSummary,
  ScheduleAgenda,
  ScheduleAgendaCalendarResponse,
  ScheduleAgendaResponse,
  ScheduleAgendaSlotsResponse,
  ScheduleAgendasResponse,
  ScheduleCalendarResponse,
  ScheduleDashboardResponse,
  ScheduleSettingsResponse,
  ScheduleSlotsResponse,
  RealtimeClientSecretResponse,
  RealtimeTranscriptAppendResponse,
  RawTranscriptResponse,
  TranscribeResponse,
} from '@/types'

export const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export class ApiError extends Error {
  status: number
  code?: string
  requestId?: string
  retryable: boolean

  constructor(message: string, status: number, options?: { code?: string; requestId?: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = options?.code
    this.requestId = options?.requestId
    this.retryable = status === 408 || status === 429 || status >= 500
  }
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  const url = new URL(`${BASE}${path}`)
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

async function parseError(res: Response): Promise<never> {
  const err = await res.json().catch(() => ({ error: res.statusText }))
  throw new ApiError(err.message || err.error || 'Não foi possível concluir a solicitação', res.status, {
    code: err.code,
    requestId: res.headers.get('x-request-id') || err.requestId,
  })
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number
}

async function request<T>(
  path: string,
  options?: RequestOptions,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) }
  if (options?.body) headers['Content-Type'] = 'application/json'

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), options?.timeoutMs || 30_000)
  const externalSignal = options?.signal
  const abortFromExternal = () => controller.abort()
  externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

  let res: Response
  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options || {}
    void _timeoutMs
    res = await fetch(buildUrl(path, query), {
      ...fetchOptions,
      headers,
      signal: controller.signal,
      credentials: 'include',
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError('A solicitação demorou mais que o esperado. Tente novamente.', 408)
    }
    throw error
  } finally {
    window.clearTimeout(timeout)
    externalSignal?.removeEventListener('abort', abortFromExternal)
  }

  if (!res.ok) return parseError(res)
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  auth: {
    login: (data: { email: string; password: string }) =>
      request<{ user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    register: (data: { email: string; password: string; name: string; suggestedName: string }) =>
      request<{ user: AuthUser }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    me: () => request<{ user: AuthUser }>('/api/auth/me'),
    logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  },

  patients: {
    page: (params?: {
      query?: string
      cursor?: string
      limit?: number
      sort?: 'name_asc' | 'name_desc' | 'recent'
      filter?: 'all' | 'risk' | 'incomplete'
    }) => request<PatientListResponse>('/api/patients', undefined, params),
    list: (search?: string) =>
      request<PatientListResponse>('/api/patients', undefined, { query: search, limit: 100 })
        .then((response) => response.items),
    duplicates: (data: { cpf?: string; name?: string; birthDate?: string }) =>
      request<{ matches: Patient[] }>('/api/patients/duplicates', undefined, data),
    get: (id: string) => request<Patient>(`/api/patients/${id}`),
    create: (data: Partial<Patient>) =>
      request<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Patient>) =>
      request<Patient>(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/patients/${id}`, { method: 'DELETE' }),
    summary: (id: string) =>
      request<{ summary: PatientSummary | null; consultationCount?: number; message?: string }>(
        `/api/patients/${id}/summary`,
        { timeoutMs: 60_000 }
      ),
  },

  consultations: {
    create: (patientId: string, scheduledAt?: string) =>
      request<Consultation>('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({ patientId, scheduledAt }),
      }),
    start: (id: string) =>
      request<Consultation>(`/api/consultations/${id}/start`, { method: 'POST' }),
    get: (id: string) => request<Consultation>(`/api/consultations/${id}`),
    update: (
      id: string,
      data: Partial<Consultation> & { manualFields?: (keyof Consultation)[] }
    ) =>
      request<Consultation>(`/api/consultations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    close: (id: string) =>
      request<Consultation>(`/api/consultations/${id}/close`, { method: 'POST' }),
    listByPatient: (patientId: string) =>
      request<Consultation[]>(`/api/consultations/patient/${patientId}`),

    transcribeChunk: async (id: string, audioBlob: Blob): Promise<TranscribeResponse> => {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'chunk.webm')
      const res = await fetch(buildUrl(`/api/consultations/${id}/transcribe`), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) return parseError(res)
      return res.json()
    },

    createRealtimeToken: (id: string) =>
      request<RealtimeClientSecretResponse>(`/api/consultations/${id}/realtime-token`, {
        method: 'POST',
      }),

    appendRealtimeTranscript: (
      id: string,
      data: { itemId: string; text: string; payload?: Record<string, unknown> }
    ) =>
      request<RealtimeTranscriptAppendResponse>(`/api/consultations/${id}/realtime-transcript`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    rawTranscript: (id: string) =>
      request<RawTranscriptResponse>(`/api/consultations/${id}/raw-transcript`),

    reinterpret: async (id: string, options?: { force?: boolean }): Promise<DeltaExtractionResult> => {
      const res = await fetch(buildUrl(`/api/consultations/${id}/reinterpret`), {
        method: 'POST',
        headers: options ? { 'Content-Type': 'application/json' } : undefined,
        body: options ? JSON.stringify(options) : undefined,
        credentials: 'include',
      })
      if (!res.ok) return parseError(res)
      return res.json()
    },

    updateAiState: (
      id: string,
      data: {
        action?: 'accept' | 'dismiss'
        suggestionId?: string
        field?: keyof ExtractedData
        templateId?: ClinicalTemplateId
      }
    ) =>
      request<{
        templateId: ClinicalTemplateId
        fieldMeta: Record<string, FieldProvenance>
        suggestions: ClinicalSuggestion[]
      }>(`/api/consultations/${id}/ai-state`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    saveAudio: async (id: string, audioBlob: Blob): Promise<{ audioPath: string }> => {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      const res = await fetch(buildUrl(`/api/consultations/${id}/audio`), {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) return parseError(res)
      return res.json()
    },

    finalize: (id: string) =>
      request<FinalizeResponse>(`/api/consultations/${id}/finalize`, { method: 'POST', timeoutMs: 120_000 }),

    audioUrl: (id: string) => `${BASE}/api/consultations/${id}/audio-file`,

    topics: (id: string) =>
      request<{ topics: ConversationTopic[] }>(`/api/consultations/${id}/topics`, { method: 'GET' }),

    createVersion: (
      id: string,
      newTranscript: string,
      reason?: string,
      editDiff?: { before: string; after: string }
    ) =>
      request<{ consultation: Consultation; extracted: ExtractedData; savedVersion: number }>(
        `/api/consultations/${id}/versions`,
        { method: 'POST', body: JSON.stringify({ newTranscript, reason, editDiff }) }
      ),

    listVersions: (id: string) => request<ConsultationVersion[]>(`/api/consultations/${id}/versions`),
  },

  schedule: {
    dashboard: (month?: string) =>
      request<ScheduleDashboardResponse>('/api/schedule/dashboard', undefined, { month }),
    agendas: () => request<ScheduleAgendasResponse>('/api/schedule/agendas'),
    createAgenda: (
      data: Omit<
        ScheduleAgenda,
        'id' | 'enabledShiftCount' | 'maxAppointmentsPerDay' | 'createdAt' | 'updatedAt'
      >
    ) =>
      request<ScheduleAgendaResponse>('/api/schedule/agendas', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    getAgenda: (agendaId: string) =>
      request<ScheduleAgendaResponse>(`/api/schedule/agendas/${agendaId}`),
    updateAgenda: (
      agendaId: string,
      data: Omit<
        ScheduleAgenda,
        'id' | 'enabledShiftCount' | 'maxAppointmentsPerDay' | 'createdAt' | 'updatedAt'
      >
    ) =>
      request<ScheduleAgendaResponse>(`/api/schedule/agendas/${agendaId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    agendaCalendar: (agendaId: string, month?: string) =>
      request<ScheduleAgendaCalendarResponse>(
        `/api/schedule/agendas/${agendaId}/calendar`,
        undefined,
        { month }
      ),
    agendaSlots: (agendaId: string, date: string) =>
      request<ScheduleAgendaSlotsResponse>(
        `/api/schedule/agendas/${agendaId}/slots`,
        undefined,
        { date }
      ),
    quickBook: async (
      agendaIdOrData: string | { patientId?: string; patientName?: string; scheduledAt: string },
      maybeData?: { patientId?: string; patientName?: string; scheduledAt: string }
    ) => {
      if (typeof agendaIdOrData === 'string') {
        return request<Consultation>(`/api/schedule/agendas/${agendaIdOrData}/quick-book`, {
          method: 'POST',
          body: JSON.stringify(maybeData),
        })
      }

      const { agendas } = await api.schedule.agendas()
      const primaryAgenda = agendas[0]
      if (!primaryAgenda) {
        throw new ApiError('Nenhuma agenda cadastrada', 404)
      }

      return request<Consultation>(`/api/schedule/agendas/${primaryAgenda.id}/quick-book`, {
        method: 'POST',
        body: JSON.stringify(agendaIdOrData),
      })
    },
    updateAppointment: (
      consultationId: string,
      data: {
        operation: 'reschedule' | 'cancel' | 'no_show'
        scheduledAt?: string
        reason: string
      }
    ) => request<Consultation>(`/api/schedule/appointments/${consultationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
    calendar: async (month?: string): Promise<ScheduleCalendarResponse> => {
      const { agendas } = await api.schedule.agendas()
      const primaryAgenda = agendas[0]
      if (!primaryAgenda) {
        throw new ApiError('Nenhuma agenda cadastrada', 404)
      }
      const [calendar, dashboard] = await Promise.all([
        api.schedule.agendaCalendar(primaryAgenda.id, month),
        api.schedule.dashboard(month),
      ])
      return {
        month: calendar.month,
        settings: calendar.agenda,
        enabledShiftCount: calendar.agenda.enabledShiftCount,
        appointments: calendar.appointments,
        stats: {
          patientsCount: dashboard.stats.patientsCount,
          consultationsCount: dashboard.stats.consultationsCount,
          todayAppointmentsCount: dashboard.stats.todayAppointmentsCount,
          completedConsultationsCount: dashboard.stats.completedConsultationsCount,
          scheduledThisMonthCount: calendar.stats.scheduledThisMonthCount,
        },
      }
    },
    settings: async (): Promise<ScheduleSettingsResponse> => {
      const { agendas } = await api.schedule.agendas()
      const primaryAgenda = agendas[0]
      if (!primaryAgenda) {
        throw new ApiError('Nenhuma agenda cadastrada', 404)
      }
      return { settings: primaryAgenda, enabledShiftCount: primaryAgenda.enabledShiftCount, maxAppointmentsPerDay: primaryAgenda.maxAppointmentsPerDay }
    },
    updateSettings: async (
      data: Pick<
        ScheduleAgenda,
        'activeWeekDays' | 'workOnHolidays' | 'appointmentDurationMinutes' | 'shifts'
      >
    ): Promise<ScheduleSettingsResponse> => {
      const { agendas } = await api.schedule.agendas()
      const primaryAgenda = agendas[0]
      if (!primaryAgenda) {
        throw new ApiError('Nenhuma agenda cadastrada', 404)
      }
      const response = await api.schedule.updateAgenda(primaryAgenda.id, {
        title: primaryAgenda.title,
        specialty: primaryAgenda.specialty,
        status: primaryAgenda.status,
        ...data,
      })
      return {
        settings: response.agenda,
        enabledShiftCount: response.agenda.enabledShiftCount,
        maxAppointmentsPerDay: response.agenda.maxAppointmentsPerDay,
      }
    },
    slots: async (date: string): Promise<ScheduleSlotsResponse> => {
      const { agendas } = await api.schedule.agendas()
      const primaryAgenda = agendas[0]
      if (!primaryAgenda) {
        throw new ApiError('Nenhuma agenda cadastrada', 404)
      }
      const response = await api.schedule.agendaSlots(primaryAgenda.id, date)
      return {
        ...response,
        settings: response.agenda,
      }
    },
  },
}

export type { CalendarAppointment }
