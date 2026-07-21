import { FastifyReply, FastifyRequest } from 'fastify'
import { getPrisma } from '../lib/prisma'
import {
  clearAuthCookie,
  hashPassword,
  sanitizeUser,
  setAuthCookie,
  signJwt,
  verifyPassword,
} from '../lib/auth'
import { getDefaultSettingsPayload } from '../lib/schedule'
import { ensurePsychologyTemplateForUser } from '../services/form-templates.service'

interface RegisterBody {
  email?: string
  password?: string
  name?: string
  suggestedName?: string
}

interface LoginBody {
  email?: string
  password?: string
}

function normalizeEmail(value?: string): string {
  return value?.trim().toLowerCase() || ''
}

function normalizeText(value?: string): string {
  return value?.trim() || ''
}

function validateRegister(body: RegisterBody) {
  const email = normalizeEmail(body.email)
  const password = body.password || ''
  const name = normalizeText(body.name)
  const suggestedName = normalizeText(body.suggestedName)

  if (!email || !email.includes('@')) {
    throw new Error('Informe um e-mail valido')
  }
  if (password.length < 8) {
    throw new Error('A senha deve ter pelo menos 8 caracteres')
  }
  if (name.length < 2) {
    throw new Error('Informe o nome completo do usuario')
  }
  if (suggestedName.length < 2) {
    throw new Error('Informe o nome sugerido que sera usado nas sessoes')
  }

  return { email, password, name, suggestedName }
}

export async function registerUser(
  req: FastifyRequest<{ Body: RegisterBody }>,
  reply: FastifyReply
) {
  try {
    const { email, password, name, suggestedName } = validateRegister(req.body || {})

    const existing = await getPrisma().user.findUnique({ where: { email } })
    if (existing) {
      return reply.status(409).send({ error: 'Ja existe um usuario com este e-mail' })
    }

    const passwordHash = await hashPassword(password)
    const user = await getPrisma().user.create({
      data: {
        email,
        passwordHash,
        name,
        suggestedName,
        schedules: {
          create: {
            title: 'Agenda principal',
            specialty: 'Clinica geral',
            status: 'ativa',
            ...getDefaultSettingsPayload(),
          },
        },
      },
      select: { id: true, email: true, name: true, suggestedName: true },
    })

    // O cadastro nao deve falhar por uma indisponibilidade transitória do seed;
    // a listagem de formularios repete esta operacao de forma idempotente.
    try {
      await ensurePsychologyTemplateForUser(user.id)
    } catch (seedError) {
      console.error('[formularios] Nao foi possivel criar o preset inicial:', seedError)
    }

    const token = signJwt(user)
    setAuthCookie(reply, req, token)

    return reply.status(201).send({ user })
  } catch (error) {
    return reply.status(400).send({
      error: error instanceof Error ? error.message : 'Nao foi possivel cadastrar o usuario',
    })
  }
}

export async function loginUser(
  req: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
) {
  const email = normalizeEmail(req.body?.email)
  const password = req.body?.password || ''

  if (!email || !password) {
    return reply.status(400).send({ error: 'Informe e-mail e senha' })
  }

  const user = await getPrisma().user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, suggestedName: true, passwordHash: true },
  })

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return reply.status(401).send({ error: 'E-mail ou senha invalidos' })
  }

  const token = signJwt(user)
  setAuthCookie(reply, req, token)

  return reply.send({ user: sanitizeUser(user) })
}

export async function getCurrentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!req.authUser) {
    return reply.status(401).send({ error: 'Sessao nao autenticada' })
  }

  return reply.send({ user: req.authUser })
}

export async function logoutUser(req: FastifyRequest, reply: FastifyReply) {
  clearAuthCookie(reply, req)
  return reply.send({ success: true })
}
