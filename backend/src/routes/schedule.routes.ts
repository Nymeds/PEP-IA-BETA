import { FastifyInstance } from 'fastify'
import {
  createSchedule,
  getDashboard,
  getAvailableSlots,
  getCalendar,
  getSchedule,
  listSchedules,
  quickBookAppointment,
  updateSchedule,
} from '../controllers/schedule.controller'

export async function scheduleRoutes(fastify: FastifyInstance) {
  fastify.get('/dashboard', getDashboard)
  fastify.get('/agendas', listSchedules)
  fastify.post('/agendas', createSchedule)
  fastify.get('/agendas/:agendaId', getSchedule)
  fastify.put('/agendas/:agendaId', updateSchedule)
  fastify.get('/agendas/:agendaId/calendar', getCalendar)
  fastify.get('/agendas/:agendaId/slots', getAvailableSlots)
  fastify.post('/agendas/:agendaId/quick-book', quickBookAppointment)
}
