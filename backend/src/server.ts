import { buildServer } from './app'
import { startRetentionWorker } from './services/retention.service'
import { hasSensitiveDataEncryption } from './services/sensitive-data.service'

const server = buildServer()

const start = async () => {
  try {
    if (process.env.NODE_ENV === 'production' && !hasSensitiveDataEncryption()) {
      throw new Error('DATA_ENCRYPTION_KEY e obrigatoria em producao')
    }
    const port = Number(process.env.PORT) || 3000
    let stopRetentionWorker: () => void = () => undefined
    server.addHook('onClose', async () => stopRetentionWorker())
    await server.listen({ port, host: '0.0.0.0' })
    stopRetentionWorker = startRetentionWorker((error) => {
      server.log.error(error, 'Falha no ciclo de retencao segura')
    })
    console.log(`\nBackend rodando em http://localhost:${port}\n`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
