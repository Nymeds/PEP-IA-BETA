import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { buildServer } from '../app'
import { getPrisma } from '../lib/prisma'

type JsonValue = Record<string, unknown>

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function logStep(message: string) {
  console.log(`- ${message}`)
}

function parseJson<T extends JsonValue>(payload: string): T {
  return JSON.parse(payload) as T
}

function getCookieFromHeaders(setCookieHeader: string | string[] | undefined): string {
  const header = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader
  assert(header, 'Cookie de sessao nao retornado')
  return header.split(';')[0]
}

async function main() {
  const backendRoot = path.resolve(__dirname, '../..')
  const smokeDbPath = path.resolve(backendRoot, 'prisma', 'smoke-routes.db')
  const smokeDbJournal = `${smokeDbPath}-journal`

  if (fs.existsSync(smokeDbPath)) fs.rmSync(smokeDbPath)
  if (fs.existsSync(smokeDbJournal)) fs.rmSync(smokeDbJournal)

  fs.writeFileSync(smokeDbPath, '')

  process.env.DATABASE_URL = 'file:./smoke-routes.db'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret-com-mais-de-32-caracteres'
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001'
  process.env.PORT = process.env.PORT || '0'

  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run db:push'], {
      cwd: backendRoot,
      env: process.env,
      stdio: 'pipe',
    })
  } else {
    execFileSync('npm', ['run', 'db:push'], {
      cwd: backendRoot,
      env: process.env,
      stdio: 'pipe',
    })
  }

  const server = buildServer()

  try {
    await server.ready()

    logStep('health sem autenticacao')
    const health = await server.inject({ method: 'GET', url: '/health' })
    assert(health.statusCode === 200, `Esperado 200 no health, recebido ${health.statusCode}`)

    logStep('GET /api/auth/me sem cookie deve retornar 401')
    const meWithoutCookie = await server.inject({ method: 'GET', url: '/api/auth/me' })
    assert(
      meWithoutCookie.statusCode === 401,
      `Esperado 401 em /api/auth/me sem sessao, recebido ${meWithoutCookie.statusCode}`
    )

    logStep('rota protegida sem cookie deve retornar 401')
    const patientsWithoutCookie = await server.inject({ method: 'GET', url: '/api/patients' })
    assert(
      patientsWithoutCookie.statusCode === 401,
      `Esperado 401 em /api/patients sem sessao, recebido ${patientsWithoutCookie.statusCode}`
    )

    logStep('cadastro de usuario')
    const register = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'medico-teste@pep.local',
        password: 'SenhaForte123',
        name: 'Medico Teste',
        suggestedName: 'Dr. Teste',
      },
    })
    assert(register.statusCode === 201, `Cadastro falhou com status ${register.statusCode}`)
    let cookie = getCookieFromHeaders(register.headers['set-cookie'])

    logStep('cadastro duplicado deve retornar 409')
    const duplicateRegister = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'medico-teste@pep.local',
        password: 'SenhaForte123',
        name: 'Medico Teste',
        suggestedName: 'Dr. Teste',
      },
    })
    assert(
      duplicateRegister.statusCode === 409,
      `Cadastro duplicado deveria falhar com 409, recebido ${duplicateRegister.statusCode}`
    )

    logStep('GET /api/auth/me com cookie')
    const meWithCookie = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    })
    assert(meWithCookie.statusCode === 200, `Sessao apos cadastro falhou com ${meWithCookie.statusCode}`)

    logStep('logout')
    const logout = await server.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    })
    assert(logout.statusCode === 200, `Logout falhou com ${logout.statusCode}`)

    logStep('login invalido deve retornar 401')
    const invalidLogin = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'medico-teste@pep.local',
        password: 'SenhaErrada123',
      },
    })
    assert(
      invalidLogin.statusCode === 401,
      `Login invalido deveria retornar 401, recebido ${invalidLogin.statusCode}`
    )

    logStep('login')
    const login = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'medico-teste@pep.local',
        password: 'SenhaForte123',
      },
    })
    assert(login.statusCode === 200, `Login falhou com status ${login.statusCode}`)
    cookie = getCookieFromHeaders(login.headers['set-cookie'])

    logStep('listar pacientes vazio')
    const emptyPatients = await server.inject({
      method: 'GET',
      url: '/api/patients',
      headers: { cookie },
    })
    assert(emptyPatients.statusCode === 200, `Listagem inicial de pacientes falhou com ${emptyPatients.statusCode}`)

    logStep('listar agendas iniciais')
    const initialAgendas = await server.inject({
      method: 'GET',
      url: '/api/schedule/agendas',
      headers: { cookie },
    })
    assert(initialAgendas.statusCode === 200, `Listagem de agendas falhou com ${initialAgendas.statusCode}`)
    const initialAgendasBody = parseJson<{ agendas: Array<{ id: string }> }>(initialAgendas.payload)
    assert(initialAgendasBody.agendas.length === 1, 'O cadastro deve criar uma agenda principal padrao')
    const primaryAgendaId = initialAgendasBody.agendas[0].id

    logStep('atualizacao da agenda principal')
    const updateSchedule = await server.inject({
      method: 'PUT',
      url: `/api/schedule/agendas/${primaryAgendaId}`,
      headers: { cookie },
      payload: {
        title: 'Agenda Clinica Geral',
        specialty: 'Clinica geral',
        status: 'ativa',
        activeWeekDays: [1, 2, 3, 4, 5],
        workOnHolidays: false,
        appointmentDurationMinutes: 30,
        shifts: [
          { id: 'manha', label: 'Manha', enabled: true, start: '08:00', end: '10:00', slots: 4 },
          { id: 'tarde', label: 'Tarde', enabled: true, start: '13:00', end: '15:00', slots: 4 },
          { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 0 },
        ],
      },
    })
    assert(updateSchedule.statusCode === 200, `Atualizacao da agenda falhou com ${updateSchedule.statusCode}`)

    logStep('criacao de segunda agenda')
    const createSecondAgenda = await server.inject({
      method: 'POST',
      url: '/api/schedule/agendas',
      headers: { cookie },
      payload: {
        title: 'Agenda Cardiologia',
        specialty: 'Cardiologia',
        status: 'ativa',
        activeWeekDays: [1, 2, 3, 4, 5],
        workOnHolidays: false,
        appointmentDurationMinutes: 30,
        shifts: [
          { id: 'manha', label: 'Manha', enabled: true, start: '08:00', end: '10:00', slots: 4 },
          { id: 'tarde', label: 'Tarde', enabled: false, start: '13:00', end: '15:00', slots: 0 },
          { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 0 },
        ],
      },
    })
    assert(createSecondAgenda.statusCode === 201, `Criacao da segunda agenda falhou com ${createSecondAgenda.statusCode}`)
    const secondaryAgendaId = parseJson<{ agenda: { id: string } }>(createSecondAgenda.payload).agenda.id

    logStep('atualizacao invalida da agenda deve retornar 400')
    const invalidSchedule = await server.inject({
      method: 'PUT',
      url: `/api/schedule/agendas/${primaryAgendaId}`,
      headers: { cookie },
      payload: {
        title: 'Agenda Invalida',
        specialty: 'Clinica geral',
        status: 'ativa',
        activeWeekDays: [],
        workOnHolidays: false,
        appointmentDurationMinutes: 30,
        shifts: [],
      },
    })
    assert(
      invalidSchedule.statusCode === 400,
      `Agenda invalida deveria falhar com 400, recebido ${invalidSchedule.statusCode}`
    )

    logStep('criar paciente completo')
    const createPatient = await server.inject({
      method: 'POST',
      url: '/api/patients',
      headers: { cookie },
      payload: {
        name: 'Paciente Principal',
        phone: '(11) 99999-0000',
        email: 'paciente@teste.local',
      },
    })
    assert(createPatient.statusCode === 201, `Criacao de paciente falhou com ${createPatient.statusCode}`)
    const createdPatient = parseJson<{ id: string }>(createPatient.payload)

    logStep('buscar paciente')
    const getPatient = await server.inject({
      method: 'GET',
      url: `/api/patients/${createdPatient.id}`,
      headers: { cookie },
    })
    assert(getPatient.statusCode === 200, `Busca de paciente falhou com ${getPatient.statusCode}`)

    logStep('editar paciente')
    const updatePatient = await server.inject({
      method: 'PUT',
      url: `/api/patients/${createdPatient.id}`,
      headers: { cookie },
      payload: {
        notes: 'Paciente atualizado pelo smoke test',
      },
    })
    assert(updatePatient.statusCode === 200, `Edicao de paciente falhou com ${updatePatient.statusCode}`)

    const nextMonday = new Date()
    while (nextMonday.getDay() !== 1) {
      nextMonday.setDate(nextMonday.getDate() + 1)
    }
    nextMonday.setHours(8, 0, 0, 0)
    const mondayDate = nextMonday.toISOString().slice(0, 10)

    logStep('listar slots do dia na agenda principal')
    const slots = await server.inject({
      method: 'GET',
      url: `/api/schedule/agendas/${primaryAgendaId}/slots?date=${mondayDate}`,
      headers: { cookie },
    })
    assert(slots.statusCode === 200, `Listagem de slots falhou com ${slots.statusCode}`)
    const slotsBody = parseJson<{ allowed: boolean; slots: Array<{ isoDateTime: string }> }>(slots.payload)
    assert(slotsBody.allowed, 'O dia de teste deveria estar permitido na agenda')
    assert(slotsBody.slots.length > 1, 'A agenda de teste deveria gerar pelo menos dois slots')
    const firstSlot = slotsBody.slots[0].isoDateTime
    const secondSlot = slotsBody.slots[1].isoDateTime

    logStep('agendamento rapido com cadastro minimo pela agenda')
    const quickBook = await server.inject({
      method: 'POST',
      url: `/api/schedule/agendas/${primaryAgendaId}/quick-book`,
      headers: { cookie },
      payload: {
        patientName: 'Paciente Rapido',
        scheduledAt: firstSlot,
      },
    })
    assert(quickBook.statusCode === 201, `Agendamento rapido falhou com ${quickBook.statusCode}`)
    const quickBookBody = parseJson<{ patientId: string; id: string }>(quickBook.payload)

    logStep('agendamento duplicado no mesmo slot deve retornar 409')
    const duplicateQuickBook = await server.inject({
      method: 'POST',
      url: `/api/schedule/agendas/${primaryAgendaId}/quick-book`,
      headers: { cookie },
      payload: {
        patientName: 'Outro Paciente',
        scheduledAt: firstSlot,
      },
    })
    assert(
      duplicateQuickBook.statusCode === 409,
      `Agendamento duplicado deveria falhar com 409, recebido ${duplicateQuickBook.statusCode}`
    )

    logStep('mesmo horario em outra agenda do mesmo medico deve retornar 409')
    const crossAgendaConflict = await server.inject({
      method: 'POST',
      url: `/api/schedule/agendas/${secondaryAgendaId}/quick-book`,
      headers: { cookie },
      payload: {
        patientName: 'Paciente Conflito',
        scheduledAt: firstSlot,
      },
    })
    assert(
      crossAgendaConflict.statusCode === 409,
      `Conflito entre agendas deveria falhar com 409, recebido ${crossAgendaConflict.statusCode}`
    )

    logStep('dashboard de agendas')
    const calendarMonth = firstSlot.slice(0, 7)
    const dashboard = await server.inject({
      method: 'GET',
      url: `/api/schedule/dashboard?month=${calendarMonth}`,
      headers: { cookie },
    })
    assert(dashboard.statusCode === 200, `Dashboard de agendas falhou com ${dashboard.statusCode}`)

    logStep('calendario mensal da agenda principal')
    const calendar = await server.inject({
      method: 'GET',
      url: `/api/schedule/agendas/${primaryAgendaId}/calendar?month=${calendarMonth}`,
      headers: { cookie },
    })
    assert(calendar.statusCode === 200, `Calendario mensal falhou com ${calendar.statusCode}`)

    logStep('consulta direta fora da agenda deve retornar 400')
    const directConsultation = await server.inject({
      method: 'POST',
      url: '/api/consultations',
      headers: { cookie },
      payload: { patientId: createdPatient.id },
    })
    assert(
      directConsultation.statusCode === 400,
      `Consulta direta deveria falhar com 400, recebido ${directConsultation.statusCode}`
    )

    logStep('agenda inativa deve bloquear novos slots')
    const deactivateSecondAgenda = await server.inject({
      method: 'PUT',
      url: `/api/schedule/agendas/${secondaryAgendaId}`,
      headers: { cookie },
      payload: {
        title: 'Agenda Cardiologia',
        specialty: 'Cardiologia',
        status: 'inativa',
        activeWeekDays: [1, 2, 3, 4, 5],
        workOnHolidays: false,
        appointmentDurationMinutes: 30,
        shifts: [
          { id: 'manha', label: 'Manha', enabled: true, start: '08:00', end: '10:00', slots: 4 },
          { id: 'tarde', label: 'Tarde', enabled: false, start: '13:00', end: '15:00', slots: 0 },
          { id: 'noite', label: 'Noite', enabled: false, start: '18:00', end: '21:00', slots: 0 },
        ],
      },
    })
    assert(deactivateSecondAgenda.statusCode === 200, `Inativacao da agenda falhou com ${deactivateSecondAgenda.statusCode}`)

    const inactiveAgendaSlots = await server.inject({
      method: 'GET',
      url: `/api/schedule/agendas/${secondaryAgendaId}/slots?date=${mondayDate}`,
      headers: { cookie },
    })
    assert(inactiveAgendaSlots.statusCode === 200, `Consulta de slots da agenda inativa falhou com ${inactiveAgendaSlots.statusCode}`)
    const inactiveAgendaSlotsBody = parseJson<{ allowed: boolean }>(inactiveAgendaSlots.payload)
    assert(!inactiveAgendaSlotsBody.allowed, 'Agenda inativa nao deveria liberar slots')

    logStep('consulta em espera nao pode ser encerrada antes de iniciar')
    const closeWaitingConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${quickBookBody.id}/close`,
      headers: { cookie },
    })
    assert(
      closeWaitingConsultation.statusCode === 409,
      `Consulta em espera deveria bloquear encerramento com 409, recebido ${closeWaitingConsultation.statusCode}`
    )

    logStep('buscar consulta')
    const getConsultation = await server.inject({
      method: 'GET',
      url: `/api/consultations/${quickBookBody.id}`,
      headers: { cookie },
    })
    assert(getConsultation.statusCode === 200, `Busca de consulta falhou com ${getConsultation.statusCode}`)

    logStep('editar consulta')
    const updateConsultation = await server.inject({
      method: 'PUT',
      url: `/api/consultations/${quickBookBody.id}`,
      headers: { cookie },
      payload: { chiefComplaint: 'Cefaleia leve' },
    })
    assert(updateConsultation.statusCode === 200, `Edicao de consulta falhou com ${updateConsultation.statusCode}`)

    logStep('criar segunda consulta em outro horario para o mesmo medico')
    const secondQuickBook = await server.inject({
      method: 'POST',
      url: `/api/schedule/agendas/${primaryAgendaId}/quick-book`,
      headers: { cookie },
      payload: {
        patientId: createdPatient.id,
        scheduledAt: secondSlot,
      },
    })
    assert(secondQuickBook.statusCode === 201, `Segundo agendamento falhou com ${secondQuickBook.statusCode}`)
    const secondQuickBookBody = parseJson<{ id: string }>(secondQuickBook.payload)

    logStep('iniciar primeira consulta agendada')
    const startFirstConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${quickBookBody.id}/start`,
      headers: { cookie },
    })
    assert(startFirstConsultation.statusCode === 200, `Inicio da primeira consulta falhou com ${startFirstConsultation.statusCode}`)

    logStep('inicio repetido da mesma consulta deve ser idempotente')
    const repeatStartFirstConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${quickBookBody.id}/start`,
      headers: { cookie },
    })
    assert(
      repeatStartFirstConsultation.statusCode === 200,
      `Inicio repetido deveria manter 200, recebido ${repeatStartFirstConsultation.statusCode}`
    )

    logStep('segunda consulta nao pode iniciar enquanto ja existe uma em andamento')
    const startSecondConsultationWhileBusy = await server.inject({
      method: 'POST',
      url: `/api/consultations/${secondQuickBookBody.id}/start`,
      headers: { cookie },
    })
    assert(
      startSecondConsultationWhileBusy.statusCode === 409,
      `Segunda consulta deveria falhar com 409, recebido ${startSecondConsultationWhileBusy.statusCode}`
    )

    logStep('listar consultas do paciente')
    const patientConsultations = await server.inject({
      method: 'GET',
      url: `/api/consultations/patient/${createdPatient.id}`,
      headers: { cookie },
    })
    assert(
      patientConsultations.statusCode === 200,
      `Listagem de consultas do paciente falhou com ${patientConsultations.statusCode}`
    )

    logStep('listar versoes da consulta')
    const versions = await server.inject({
      method: 'GET',
      url: `/api/consultations/${quickBookBody.id}/versions`,
      headers: { cookie },
    })
    assert(versions.statusCode === 200, `Listagem de versoes falhou com ${versions.statusCode}`)

    logStep('encerrar primeira consulta')
    const closeFirstConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${quickBookBody.id}/close`,
      headers: { cookie },
    })
    assert(
      closeFirstConsultation.statusCode === 200,
      `Encerramento da primeira consulta falhou com ${closeFirstConsultation.statusCode}`
    )

    logStep('segunda consulta pode iniciar apos encerrar a primeira')
    const startSecondConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${secondQuickBookBody.id}/start`,
      headers: { cookie },
    })
    assert(
      startSecondConsultation.statusCode === 200,
      `Inicio da segunda consulta falhou com ${startSecondConsultation.statusCode}`
    )

    const closeSecondConsultation = await server.inject({
      method: 'POST',
      url: `/api/consultations/${secondQuickBookBody.id}/close`,
      headers: { cookie },
    })
    assert(
      closeSecondConsultation.statusCode === 200,
      `Encerramento da segunda consulta falhou com ${closeSecondConsultation.statusCode}`
    )

    logStep('segundo usuario nao deve acessar dados do primeiro')
    const secondRegister = await server.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'medico-2@pep.local',
        password: 'SenhaForte123',
        name: 'Medico Dois',
        suggestedName: 'Dra. Dois',
      },
    })
    assert(secondRegister.statusCode === 201, `Segundo cadastro falhou com ${secondRegister.statusCode}`)
    const secondCookie = getCookieFromHeaders(secondRegister.headers['set-cookie'])

    const secondUserPatientAccess = await server.inject({
      method: 'GET',
      url: `/api/patients/${createdPatient.id}`,
      headers: { cookie: secondCookie },
    })
    assert(
      secondUserPatientAccess.statusCode === 404,
      `Segundo usuario nao deveria acessar paciente alheio; recebido ${secondUserPatientAccess.statusCode}`
    )

    const secondUserConsultationAccess = await server.inject({
      method: 'GET',
      url: `/api/consultations/${quickBookBody.id}`,
      headers: { cookie: secondCookie },
    })
    assert(
      secondUserConsultationAccess.statusCode === 404,
      `Segundo usuario nao deveria acessar consulta alheia; recebido ${secondUserConsultationAccess.statusCode}`
    )

    const secondUserAgendaAccess = await server.inject({
      method: 'GET',
      url: `/api/schedule/agendas/${primaryAgendaId}`,
      headers: { cookie: secondCookie },
    })
    assert(
      secondUserAgendaAccess.statusCode === 404,
      `Segundo usuario nao deveria acessar agenda alheia; recebido ${secondUserAgendaAccess.statusCode}`
    )

    logStep('resumo do paciente sem OpenAI nao deve ser usado neste smoke test')
    logStep('rotas nao dependentes de OpenAI validadas com sucesso')

    const patientsCount = await getPrisma().patient.count()
    const consultationsCount = await getPrisma().consultation.count()
    console.log(`Resumo: ${patientsCount} paciente(s) e ${consultationsCount} consulta(s) criados no smoke test.`)
    console.log(`Consulta rapida criada para patientId ${quickBookBody.patientId} e consulta ${quickBookBody.id}.`)
  } finally {
    await server.close()
    await getPrisma().$disconnect()

    if (fs.existsSync(smokeDbPath)) fs.rmSync(smokeDbPath)
    if (fs.existsSync(smokeDbJournal)) fs.rmSync(smokeDbJournal)
  }
}

void main().catch((error) => {
  console.error('\nSmoke test falhou:')
  console.error(error)
  process.exit(1)
})
