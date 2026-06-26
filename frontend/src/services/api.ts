import {
  Consultation,
  Patient,
  TranscribeResponse,
  ExtractedData,
  FinalizeResponse,
  ConversationTopic,
  ConsultationVersion,
  PatientSummary,
} from '@/types'

// URL do backend. Configurável via NEXT_PUBLIC_API_URL (o Next embute o valor no
// build do client); cai para localhost:3000 em desenvolvimento.
export const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Só envia Content-Type: application/json quando há corpo — senão o Fastify
  // rejeita POSTs sem body (ex: finalize/reinterpret) com FST_ERR_CTP_EMPTY_JSON_BODY.
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) }
  if (options?.body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.message || err.error || 'Erro na requisição')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  // Patients
  patients: {
    list: () => request<Patient[]>('/api/patients'),
    get: (id: string) => request<Patient>(`/api/patients/${id}`),
    create: (data: Partial<Patient>) =>
      request<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Patient>) =>
      request<Patient>(`/api/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/patients/${id}`, { method: 'DELETE' }),
    summary: (id: string) =>
      request<{ summary: PatientSummary | null; consultationCount?: number; message?: string }>(
        `/api/patients/${id}/summary`
      ),
  },

  // Consultations
  consultations: {
    // Sem scheduledAt → atendimento imediato (active). Com data → agendada (scheduled).
    create: (patientId: string, scheduledAt?: string) =>
      request<Consultation>('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({ patientId, scheduledAt }),
      }),
    get: (id: string) => request<Consultation>(`/api/consultations/${id}`),
    update: (id: string, data: Partial<Consultation>) =>
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
      const res = await fetch(`${BASE}/api/consultations/${id}/transcribe`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }))
        throw new Error(body.message || body.error || `Erro ${res.status} na transcrição`)
      }
      return res.json()
    },

    // Relê toda a transcrição acumulada e consolida os campos clínicos
    reinterpret: async (id: string): Promise<{ extracted: ExtractedData }> => {
      const res = await fetch(`${BASE}/api/consultations/${id}/reinterpret`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: res.statusText }))
        throw new Error(body.message || body.error || `Erro ${res.status} na interpretação`)
      }
      return res.json()
    },

    saveAudio: async (id: string, audioBlob: Blob): Promise<{ audioPath: string }> => {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.webm')
      const res = await fetch(`${BASE}/api/consultations/${id}/audio`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error('Erro ao salvar áudio')
      return res.json()
    },

    finalize: (id: string) =>
      request<FinalizeResponse>(`/api/consultations/${id}/finalize`, { method: 'POST' }),

    // URL direta do áudio gravado (para o elemento <audio>)
    audioUrl: (id: string) => `${BASE}/api/consultations/${id}/audio-file`,

    // Tópicos da conversa sugeridos pela IA
    topics: (id: string) =>
      request<{ topics: ConversationTopic[] }>(`/api/consultations/${id}/topics`, { method: 'GET' }),

    // Cria nova versão a partir da transcrição editada (re-extrai o PEP)
    createVersion: (id: string, newTranscript: string, reason?: string, editDiff?: { before: string; after: string }) =>
      request<{ consultation: Consultation; extracted: ExtractedData; savedVersion: number }>(
        `/api/consultations/${id}/versions`,
        { method: 'POST', body: JSON.stringify({ newTranscript, reason, editDiff }) }
      ),

    listVersions: (id: string) =>
      request<ConsultationVersion[]>(`/api/consultations/${id}/versions`),
  },
}
