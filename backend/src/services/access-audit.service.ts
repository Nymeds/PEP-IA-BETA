import { getPrisma } from '../lib/prisma'

export async function recordSensitiveAccess(input: {
  actorUserId: string
  consultationId?: string | null
  dataClass: 'audio_consulta' | 'transcricao_consulta' | 'prontuario_compartilhavel' | 'registro_psicologico_restrito'
  action: string
  requestId?: string | null
}) {
  await getPrisma().accessAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      consultationId: input.consultationId || null,
      dataClass: input.dataClass,
      action: input.action,
      requestId: input.requestId || null,
    },
  })
}
