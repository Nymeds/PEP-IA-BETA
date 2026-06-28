import { FastifyInstance } from 'fastify'
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from '../controllers/auth.controller'

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/register', registerUser)
  fastify.post('/login', loginUser)
  fastify.get('/me', getCurrentUser)
  fastify.post('/logout', logoutUser)
}
