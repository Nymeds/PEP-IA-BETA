import OpenAI from 'openai'
import { jsonSchemaResponseFormat, soapSchema } from './openai-schemas'
import { recordAiUsage } from './ai-usage.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export interface SoapNote {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

interface SoapOptions {
  consultationId?: string
}

const SYSTEM_PROMPT = `Voce e um medico experiente gerando evolucao clinica formal no formato SOAP.

Use portugues medico formal e conciso.
Nao invente informacoes.
Se uma secao nao tiver dados suficientes, registre isso de forma objetiva.`

export async function generateSoap(
  fullTranscript: string,
  options: SoapOptions = {}
): Promise<SoapNote> {
  const model = process.env.OPENAI_SOAP_MODEL || 'gpt-4o'
  const startedAt = Date.now()

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcricao estruturada da consulta:\n\n${fullTranscript}` },
    ],
    temperature: 0.2,
    max_tokens: 2200,
    response_format: jsonSchemaResponseFormat(
      'soap_note',
      soapSchema,
      'Evolucao clinica no formato SOAP'
    ),
  })

  await recordAiUsage(
    {
      consultationId: options.consultationId,
      service: 'soap_generation',
      model,
      reason: 'finalizacao_consulta',
      startedAt,
    },
    response.usage
  )

  try {
    return JSON.parse(response.choices[0]?.message?.content || '{}') as SoapNote
  } catch {
    return {
      subjective: 'Nao foi possivel gerar automaticamente. Por favor, preencha manualmente.',
      objective: '',
      assessment: '',
      plan: '',
    }
  }
}
