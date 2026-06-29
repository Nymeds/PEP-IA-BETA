import OpenAI from 'openai'

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

const SYSTEM_PROMPT = `Você é um médico experiente gerando uma evolução clínica formal.

Com base na transcrição completa da consulta fornecida, gere uma evolução clínica no formato SOAP em português médico formal.

Retorne SOMENTE um objeto JSON válido sem markdown, sem texto adicional:
{
  "subjective": "Dados subjetivos: queixas, sintomas e história relatados pelo paciente",
  "objective": "Dados objetivos: sinais vitais, exame físico, achados objetivos",
  "assessment": "Avaliação: hipótese(s) diagnóstica(s) e raciocínio clínico",
  "plan": "Plano: condutas, prescrições, orientações, encaminhamentos, retorno"
}

Use linguagem médica formal e concisa. Se alguma seção não tiver informação suficiente, use uma frase indicando isso.`

export async function generateSoap(fullTranscript: string): Promise<SoapNote> {
  const model = process.env.OPENAI_SOAP_MODEL || 'gpt-4o'

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Transcrição completa da consulta:\n\n${fullTranscript}` },
    ],
    temperature: 0.2,
    max_tokens: 3000,
  })

  const content = response.choices[0]?.message?.content || '{}'

  try {
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as SoapNote
  } catch {
    return {
      subjective: 'Não foi possível gerar automaticamente. Por favor, preencha manualmente.',
      objective: '',
      assessment: '',
      plan: '',
    }
  }
}
