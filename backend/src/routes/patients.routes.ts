import { FastifyInstance } from 'fastify'
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  getPatientSummary,
} from '../controllers/patients.controller'

export async function patientsRoutes(fastify: FastifyInstance) {
  fastify.get('/', listPatients)
  fastify.get('/:id', getPatient)
  fastify.post('/', createPatient)
  fastify.put('/:id', updatePatient)
  fastify.delete('/:id', deletePatient)
  fastify.get('/:id/summary', getPatientSummary)
}
