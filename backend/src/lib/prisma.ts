import { PrismaClient } from '@prisma/client'
import path from 'path'

// Diretório do schema do Prisma: backend/prisma.
// __dirname aqui é backend/src/lib, então sobe dois níveis até backend/ e entra em prisma/.
const PRISMA_DIR = path.resolve(__dirname, '../../prisma')

// Resolve a URL do banco respeitando DATABASE_URL. Caminhos relativos de "file:" são
// ancorados em backend/prisma/ (mesma regra do `prisma db push`) — e NÃO no CWD — para
// que runtime e CLI usem sempre o MESMO arquivo, independente de onde o backend foi iniciado.
// Sem DATABASE_URL, cai no padrão backend/prisma/dev.db.
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim()

  if (fromEnv?.startsWith('file:')) {
    const filePath = fromEnv.slice('file:'.length)
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(PRISMA_DIR, filePath)
    return `file:${abs}`
  }

  // Outros providers (postgres, mysql, ...) ou string já absoluta: usa como veio.
  if (fromEnv) return fromEnv

  return `file:${path.resolve(PRISMA_DIR, 'dev.db')}`
}

let _prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasources: { db: { url: resolveDatabaseUrl() } },
    })
  }
  return _prisma
}
