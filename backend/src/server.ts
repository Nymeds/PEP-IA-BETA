import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import path from 'path'
import dotenv from 'dotenv'

// Carrega a raiz como defaults e o backend/.env por cima (tem prioridade)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true })
// O caminho do banco é definido de forma absoluta e fixa em lib/prisma.ts — não depende daqui.

import { patientsRoutes } from './routes/patients.routes'
import { consultationsRoutes } from './routes/consultations.routes'

const server = Fastify({
  ignoreTrailingSlash: true,
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
})

// Aceita POST com corpo vazio mesmo com Content-Type: application/json
// (ex: /finalize e /reinterpret não enviam body) sem retornar 400.
server.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body || (body as string).trim() === '') return done(null, {})
  try {
    done(null, JSON.parse(body as string))
  } catch (err) {
    done(err as Error, undefined)
  }
})

server.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
})
server.register(multipart, {
  limits: { fileSize: 100 * 1024 * 1024 },
})

server.register(patientsRoutes, { prefix: '/api/patients' })
server.register(consultationsRoutes, { prefix: '/api/consultations' })

server.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000
    await server.listen({ port, host: '0.0.0.0' })
    console.log(`\n🚀 Backend rodando em http://localhost:${port}\n`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
