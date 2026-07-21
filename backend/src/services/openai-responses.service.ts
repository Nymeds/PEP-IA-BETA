import { createHash } from 'crypto'
import OpenAI from 'openai'

let openai: OpenAI | null = null

function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai
}

export interface StructuredResponseUsage {
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedTokens: number
}

export interface StructuredResponseResult<T> {
  data: T
  usage: StructuredResponseUsage
  responseId: string
}

export interface StructuredResponseOptions {
  model: string
  reasoningEffort: 'low' | 'medium' | 'high'
  instructions: string
  input: unknown
  schemaName: string
  schemaDescription: string
  schema: Record<string, unknown>
  maxOutputTokens: number
  promptCacheKey?: string
  safetyIdentifier?: string
}

function cleanStructuredOutput(value: string) {
  return value.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
}

function safeIdentifier(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Executa uma resposta estruturada sem persistir estado conversacional na OpenAI.
 * O cast preserva compatibilidade com o SDK v4 do projeto, que ainda nao tipa
 * prompt_cache_key, embora o campo seja aceito pela Responses API atual.
 */
export async function createStructuredResponse<T>(
  options: StructuredResponseOptions
): Promise<StructuredResponseResult<T>> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nao configurada')

  const requestBody: Record<string, unknown> = {
    model: options.model,
    store: false,
    instructions: options.instructions,
    input: typeof options.input === 'string' ? options.input : JSON.stringify(options.input),
    reasoning: { effort: options.reasoningEffort },
    max_output_tokens: options.maxOutputTokens,
    text: {
      format: {
        type: 'json_schema',
        name: options.schemaName,
        description: options.schemaDescription,
        strict: true,
        schema: options.schema,
      },
    },
  }

  if (options.promptCacheKey) requestBody.prompt_cache_key = options.promptCacheKey
  if (options.safetyIdentifier) {
    requestBody.safety_identifier = safeIdentifier(options.safetyIdentifier)
  }

  const response = await getOpenAI().responses.create(requestBody as never)
  const outputText = cleanStructuredOutput(response.output_text || '')
  if (!outputText) throw new Error('A IA nao retornou conteudo estruturado')

  let data: T
  try {
    data = JSON.parse(outputText) as T
  } catch {
    throw new Error('A IA retornou JSON invalido')
  }

  const usage = response.usage
  const cachedTokens = Number(
    (usage?.input_tokens_details as { cached_tokens?: number } | null | undefined)?.cached_tokens || 0
  )

  return {
    data,
    responseId: response.id,
    usage: {
      model: response.model || options.model,
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      cachedTokens,
    },
  }
}
