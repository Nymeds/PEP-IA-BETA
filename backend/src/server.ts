import { buildServer } from './app'

const server = buildServer()

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000
    await server.listen({ port, host: '0.0.0.0' })
    console.log(`\nBackend rodando em http://localhost:${port}\n`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
