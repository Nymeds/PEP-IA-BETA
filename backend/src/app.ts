import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import path from 'path'
import dotenv from 'dotenv'
import { clearAuthCookie, getTokenFromRequest, verifyJwt } from './lib/auth'
import { getPrisma } from './lib/prisma'
import { authRoutes } from './routes/auth.routes'
import { patientsRoutes } from './routes/patients.routes'
import { consultationsRoutes } from './routes/consultations.routes'
import { scheduleRoutes } from './routes/schedule.routes'

// Carrega a raiz como defaults e o backend/.env por cima (tem prioridade)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })

const PUBLIC_ROUTES = new Set([
  'GET:/health',
  'POST:/api/auth/login',
  'POST:/api/auth/register',
])

export function buildServer() {
  const server = Fastify({
    routerOptions: {
      ignoreTrailingSlash: true,
    },
    logger: {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  })

  // Aceita POST com corpo vazio mesmo com Content-Type: application/json
  server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body || (body as string).trim() === '') return done(null, {})
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  server.register(cors, {
    origin: (origin, callback) => {
      const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3001')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origem nao permitida pelo CORS'), false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    exposedHeaders: ['x-request-id'],
  })

  server.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 },
  })

  server.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
    if (request.method === 'OPTIONS') return

    const pathname = new URL(request.raw.url || '/', 'http://localhost').pathname
    if (PUBLIC_ROUTES.has(`${request.method}:${pathname}`)) return

    const token = getTokenFromRequest(request)
    if (!token) {
      clearAuthCookie(reply, request)
      return reply.status(401).send({ error: 'Sessao expirada ou nao autenticada' })
    }

    const payload = verifyJwt(token)
    if (!payload) {
      clearAuthCookie(reply, request)
      return reply.status(401).send({ error: 'Token invalido ou expirado' })
    }

    const user = await getPrisma().user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, suggestedName: true },
    })

    if (!user) {
      clearAuthCookie(reply, request)
      return reply.status(401).send({ error: 'Usuario autenticado nao encontrado' })
    }

    request.authUser = user
  })

  server.register(authRoutes, { prefix: '/api/auth' })
  server.register(patientsRoutes, { prefix: '/api/patients' })
  server.register(consultationsRoutes, { prefix: '/api/consultations' })
  server.register(scheduleRoutes, { prefix: '/api/schedule' })

  server.setErrorHandler((error, request, reply) => {
    const normalizedError = error instanceof Error ? error : new Error('Erro interno')
    const candidateStatus = typeof error === 'object' && error && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 500
    const statusCode = Number.isInteger(candidateStatus) && candidateStatus >= 400 ? candidateStatus : 500
    request.log.error({ requestId: request.id, name: normalizedError.name, statusCode }, 'Falha na requisicao')
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Nao foi possivel concluir a operacao' : normalizedError.message,
      code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      requestId: request.id,
    })
  })

  server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  return server
}
