import { PrismaClient } from '@prisma/client'
import path from 'path'

// Caminho ABSOLUTO e fixo do banco: backend/prisma/dev.db.
// __dirname aqui é backend/src/lib, então sobe dois níveis até backend/ e entra em prisma/.
// Independe do CWD, do .env e de quando o dotenv carrega — é sempre o MESMO arquivo.
const DB_PATH = path.resolve(__dirname, '../../prisma/dev.db')

let _prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      datasources: { db: { url: `file:${DB_PATH}` } },
    })
  }
  return _prisma
}
