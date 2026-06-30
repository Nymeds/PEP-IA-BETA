import { createHash } from 'crypto'

interface OpenAIRealtimeSecretPayload {
  value?: string
  expires_at?: number
  client_secret?: {
    value?: string
    expires_at?: number
  }
}

export interface RealtimeClientSecret {
  value: string
  expiresAt: number | null
}

const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime/client_secrets'

function buildSafetyIdentifier(userId: string): string {
  return createHash('sha256').update(userId).digest('hex')
}

export async function createRealtimeClientSecret(userId: string): Promise<RealtimeClientSecret> {
  const apiKey = process.env.OPENAI_API_KEY
  const transcriptionModel = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || 'gpt-realtime-whisper'
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY nao configurada')
  }

  const response = await fetch(OPENAI_REALTIME_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': buildSafetyIdentifier(userId),
    },
    body: JSON.stringify({
      expires_after: {
        anchor: 'created_at',
        seconds: 600,
      },
      session: {
        type: 'transcription',
        audio: {
          input: {
            transcription: {
              model: transcriptionModel,
              language: 'pt',
              delay: 'medium',
            },
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(errorText || 'Falha ao criar client_secret do Realtime')
  }

  const payload = (await response.json()) as OpenAIRealtimeSecretPayload
  const value = payload.value || payload.client_secret?.value

  if (!value) {
    throw new Error('Resposta invalida da OpenAI ao criar client_secret')
  }

  return {
    value,
    expiresAt: payload.expires_at ?? payload.client_secret?.expires_at ?? null,
  }
}
