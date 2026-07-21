import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const TEXT_ENCRYPTION_PREFIX = 'enc:v1:'
const TEXT_PLAINTEXT_PREFIX = 'plain:v1:'
const AUDIO_MAGIC = Buffer.from('PEPIAENC1', 'ascii')

function encryptionKey(): Buffer | null {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim()
  if (!configured) return null

  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex')
  try {
    const decoded = Buffer.from(configured, 'base64')
    if (decoded.length === 32) return decoded
  } catch {
    // Continua para derivacao deterministica abaixo.
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATA_ENCRYPTION_KEY deve conter 32 bytes em base64 ou 64 caracteres hexadecimais')
  }
  return createHash('sha256').update(configured).digest()
}

export function hasSensitiveDataEncryption() {
  return Boolean(encryptionKey())
}

export function protectSensitiveText(value: string) {
  const key = encryptionKey()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATA_ENCRYPTION_KEY obrigatoria para dados restritos em producao')
    }
    return `${TEXT_PLAINTEXT_PREFIX}${value}`
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${TEXT_ENCRYPTION_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`
}

export function revealSensitiveText(value: string) {
  if (value.startsWith(TEXT_PLAINTEXT_PREFIX)) return value.slice(TEXT_PLAINTEXT_PREFIX.length)
  if (!value.startsWith(TEXT_ENCRYPTION_PREFIX)) return value

  const key = encryptionKey()
  if (!key) throw new Error('DATA_ENCRYPTION_KEY nao configurada para ler dado restrito')
  const payload = Buffer.from(value.slice(TEXT_ENCRYPTION_PREFIX.length), 'base64')
  if (payload.length < 29) throw new Error('Conteudo restrito criptografado invalido')
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const encrypted = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function protectAudioBuffer(value: Buffer) {
  const key = encryptionKey()
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATA_ENCRYPTION_KEY obrigatoria para audios em producao')
    }
    return { encrypted: false, data: value }
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()])
  const tag = cipher.getAuthTag()
  return { encrypted: true, data: Buffer.concat([AUDIO_MAGIC, iv, tag, encrypted]) }
}

export function revealAudioBuffer(value: Buffer) {
  if (!value.subarray(0, AUDIO_MAGIC.length).equals(AUDIO_MAGIC)) return value
  const key = encryptionKey()
  if (!key) throw new Error('DATA_ENCRYPTION_KEY nao configurada para ler audio')
  const ivStart = AUDIO_MAGIC.length
  const tagStart = ivStart + 12
  const contentStart = tagStart + 16
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(ivStart, tagStart))
  decipher.setAuthTag(value.subarray(tagStart, contentStart))
  return Buffer.concat([decipher.update(value.subarray(contentStart)), decipher.final()])
}

export function isProtectedAudio(value: Buffer) {
  return value.subarray(0, AUDIO_MAGIC.length).equals(AUDIO_MAGIC)
}
