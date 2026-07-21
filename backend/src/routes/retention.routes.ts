import { FastifyInstance } from 'fastify'
import { getRetentionPolicy, updateRetentionPolicy } from '../controllers/retention.controller'

export async function retentionRoutes(fastify: FastifyInstance) {
  fastify.get('/', getRetentionPolicy)
  fastify.patch('/', updateRetentionPolicy)
}
