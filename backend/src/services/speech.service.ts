import OpenAI from 'openai'
import { randomUUID } from 'crypto'
import { toFile } from 'openai/uploads'
import { writeFile, mkdir, readFile, unlink } from 'fs/promises'
import path from 'path'
import { protectAudioBuffer, revealAudioBuffer } from './sensitive-data.service'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/audio')

function resolveStoredAudioPath(filePath: string) {
  const resolved = path.resolve(filePath)
  const relative = path.relative(UPLOADS_DIR, resolved)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Caminho de audio fora da area permitida')
  }
  return resolved
}

export async function ensureUploadsDir() {
  await mkdir(UPLOADS_DIR, { recursive: true })
}

// Frases que o Whisper costuma "alucinar" em trechos de silêncio ou ruído.
// São padrões típicos de legendas de vídeo do YouTube que vazam do treino do modelo.
const HALLUCINATION_BLOCKLIST = [
  'se inscreva',
  'inscreva-se',
  'inscrever no canal',
  'inscrevam',
  'deixe seu like',
  'deixe o like',
  'curta o vídeo',
  'curtam o vídeo',
  'ative o sininho',
  'obrigado por assistir',
  'obrigada por assistir',
  'obrigado por assistirem',
  'até o próximo vídeo',
  'até a próxima',
  'nos vemos no próximo',
  'não esqueça de',
  'compartilhe o vídeo',
  'legendas pela comunidade',
  'legendado por',
  'legendas pela',
  'amara.org',
  'tradução e legendas',
  'transcrição:',
  'tchau tchau',
]

interface WhisperSegment {
  text: string
  avg_logprob: number
  no_speech_prob: number
  compression_ratio: number
}

// Decide se um trecho transcrito é provável alucinação/ruído e deve ser descartado.
function isHallucination(text: string, segment?: WhisperSegment): boolean {
  const lower = text.toLowerCase().trim()
  if (!lower) return true

  // Filtro 1: frases conhecidas de legenda/propaganda de vídeo
  if (HALLUCINATION_BLOCKLIST.some((p) => lower.includes(p))) return true

  // Filtro 2: métricas de confiança do Whisper (só existem em verbose_json)
  if (segment) {
    // Alta probabilidade de "sem fala" + baixa confiança = silêncio com texto inventado
    if (segment.no_speech_prob > 0.6 && segment.avg_logprob < -0.4) return true
    // Confiança muito baixa em qualquer caso
    if (segment.avg_logprob < -1.0) return true
    // Texto muito repetitivo (loop de alucinação)
    if (segment.compression_ratio > 2.4) return true
  }

  return false
}

const WHISPER_CONTEXT_PROMPT =
  'Transcrição de uma consulta clínica ou psicológica em português do Brasil. ' +
  'Preserve literalmente a conversa entre profissional, paciente e eventuais participantes.'

export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<string> {
  const ext = mimeType.includes('webm') ? 'webm' : 'mp3'

  try {
    const model = (process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1') as string
    const useSegments = model.includes('whisper') // só whisper-1 suporta verbose_json

    const transcription = await getOpenAI().audio.transcriptions.create({
      file: await toFile(audioBuffer, `segmento.${ext}`, { type: mimeType }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: model as any,
      language: 'pt',
      prompt: WHISPER_CONTEXT_PROMPT,
      temperature: 0,
      response_format: useSegments ? 'verbose_json' : 'text',
    })

    let clean = ''

    if (useSegments && typeof transcription !== 'string') {
      // Modo verbose_json: filtra segmento por segmento usando as métricas de confiança
      const segments = (transcription as unknown as { segments?: WhisperSegment[] }).segments || []
      const kept: string[] = []
      for (const seg of segments) {
        if (isHallucination(seg.text, seg)) {
          console.info('[speech] Segmento descartado por baixa confianca ou padrao de alucinacao')
          continue
        }
        kept.push(seg.text.trim())
      }
      clean = kept.join(' ').trim()
    } else {
      // Modo text: só dá pra filtrar pela blocklist
      const raw = typeof transcription === 'string' ? transcription : (transcription as { text: string }).text
      clean = isHallucination(raw) ? '' : raw.trim()
    }

    if (clean) console.info('[speech] Transcricao concluida', { characterCount: clean.length })
    return clean
  } catch (err) {
    console.error('[speech] Erro na transcrição:', err)
    throw err
  }
}

export async function saveFullAudio(
  consultationId: string,
  audioBuffer: Buffer,
  mimeType: string = 'audio/webm'
): Promise<{ filePath: string; encrypted: boolean }> {
  await ensureUploadsDir()
  const ext = mimeType.includes('webm') ? 'webm' : 'mp3'
  const protectedAudio = protectAudioBuffer(audioBuffer)
  const filename = `${consultationId}_${Date.now()}_${randomUUID()}.${ext}${protectedAudio.encrypted ? '.enc' : ''}`
  const filePath = path.join(UPLOADS_DIR, filename)
  await writeFile(filePath, protectedAudio.data)
  return { filePath, encrypted: protectedAudio.encrypted }
}

export async function readFullAudio(filePath: string) {
  return revealAudioBuffer(await readFile(resolveStoredAudioPath(filePath)))
}

export async function removeStoredAudio(filePath: string) {
  const resolved = resolveStoredAudioPath(filePath)
  await unlink(resolved).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
  })
}
