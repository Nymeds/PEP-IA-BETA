import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'
import { FastifyReply, FastifyRequest } from 'fastify'
import { parseCookies, serializeCookie } from './cookies'

const scrypt = promisify(scryptCallback)

export const AUTH_COOKIE_NAME = 'pep_token'
const TOKEN_TTL_SECONDS = 60 * 60 * 12
const PASSWORD_KEY_LENGTH = 64

export interface JwtPayload {
  sub: string
  email: string
  name: string
  suggestedName: string
  iat: number
  exp: number
}

interface SessionUserInput {
  id: string
  email: string
  name: string
  suggestedName: string
}

let warnedAboutFallbackSecret = false

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim()
  if (secret && secret.length >= 32) return secret

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET precisa estar configurado com ao menos 32 caracteres em producao')
  }

  if (!warnedAboutFallbackSecret) {
    warnedAboutFallbackSecret = true
    console.warn(
      '[auth] JWT_SECRET ausente ou curto. Usando segredo de desenvolvimento; troque antes de subir em producao.'
    )
  }

  return 'pep-ia-dev-secret-altere-antes-de-produzir-2026'
}

function isSecureCookie(request: FastifyRequest): boolean {
  return process.env.NODE_ENV === 'production' || request.protocol === 'https'
}

function base64UrlJson(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer
  return `${salt}:${derived.toString('hex')}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, savedHash] = storedHash.split(':')
  if (!salt || !savedHash) return false

  const derived = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer
  const savedBuffer = Buffer.from(savedHash, 'hex')

  if (savedBuffer.length !== derived.length) return false

  return timingSafeEqual(savedBuffer, derived)
}

export function signJwt(user: SessionUserInput): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    suggestedName: user.suggestedName,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }

  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64UrlJson(header)
  const encodedPayload = base64UrlJson(payload)
  const signature = createHmac('sha256', getJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  return `${encodedHeader}.${encodedPayload}.${signature}`
}

export function verifyJwt(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [encodedHeader, encodedPayload, signature] = parts
  const expected = createHmac('sha256', getJwtSecret())
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url')

  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  if (signatureBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as JwtPayload
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getTokenFromRequest(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim()
  }

  const cookies = parseCookies(request.headers.cookie)
  return cookies[AUTH_COOKIE_NAME] || null
}

export function setAuthCookie(reply: FastifyReply, request: FastifyRequest, token: string) {
  reply.header(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecureCookie(request),
      sameSite: 'Lax',
      maxAge: TOKEN_TTL_SECONDS,
      path: '/',
    })
  )
}

export function clearAuthCookie(reply: FastifyReply, request: FastifyRequest) {
  reply.header(
    'Set-Cookie',
    serializeCookie(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isSecureCookie(request),
      sameSite: 'Lax',
      maxAge: 0,
      path: '/',
    })
  )
}

export function sanitizeUser<T extends SessionUserInput>(user: T): SessionUserInput {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    suggestedName: user.suggestedName,
  }
}
