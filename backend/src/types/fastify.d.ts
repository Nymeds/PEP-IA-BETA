import 'fastify'

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
  suggestedName: string
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedUser
  }
}
