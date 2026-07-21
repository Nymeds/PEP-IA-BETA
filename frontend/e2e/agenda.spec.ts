import { expect, test, type Page, type Route } from '@playwright/test'

const TODAY = '2026-07-19'

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

const agenda = {
  id: 'agenda-psi',
  title: 'Agenda Psicologia',
  specialty: 'Psicologia',
  specialtyCode: 'psicologia',
  formTemplateId: 'seed',
  status: 'ativa',
  activeWeekDays: [0, 1, 2, 3, 4, 5],
  workOnHolidays: false,
  appointmentDurationMinutes: 30,
  shifts: [{ id: 'manha', label: 'Manhã', enabled: true, start: '08:00', end: '12:00', slots: 8 }],
  enabledShiftCount: 1,
  maxAppointmentsPerDay: 8,
  createdAt: `${TODAY}T10:00:00.000Z`,
  updatedAt: `${TODAY}T10:00:00.000Z`,
}

async function mockAgenda(page: Page) {
  await page.context().addCookies([{
    name: 'pep_token',
    value: 'token-e2e-agenda',
    url: 'http://127.0.0.1:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }])

  await page.route('**/api/auth/me', (route) => fulfillJson(route, {
    user: {
      id: 'profissional-e2e',
      email: 'psicologa@e2e.local',
      name: 'Psicóloga E2E',
      suggestedName: 'Dra. E2E',
    },
  }))

  await page.route('**/api/form-templates**', (route) => fulfillJson(route, {
    items: [{
      id: 'seed',
      name: 'Prontuário E2E',
      specialtyCode: 'psicologia',
      status: 'publicado',
      isDefault: true,
      latestVersion: { id: 'seed-v1', version: 1 },
    }],
  }))

  await page.route('**/api/schedule/agendas', (route) => fulfillJson(route, { agendas: [agenda] }))
  await page.route('**/api/schedule/agendas/agenda-psi/calendar**', (route) => fulfillJson(route, {
    month: '2026-07',
    agenda,
    appointments: [],
    stats: {
      scheduledThisMonthCount: 1,
      waitingConsultationsCount: 1,
      completedConsultationsCount: 0,
      todayAppointmentsCount: 1,
    },
  }))
  await page.route('**/api/schedule/agendas/agenda-psi/slots**', (route) => {
    const date = new URL(route.request().url()).searchParams.get('date') || TODAY
    const appointment = date === TODAY ? {
      id: 'consulta-1',
      patientId: 'paciente-1',
      patientName: 'Paciente Teste',
      scheduledAt: `${date}T12:00:00.000Z`,
      localDateTime: `${date}T09:00`,
      status: 'scheduled',
      chiefComplaint: 'Acompanhamento psicológico',
      formMode: 'dynamic',
      specialtyCode: 'psicologia',
      formTemplateVersionId: 'seed-v1',
      formTemplateName: 'Prontuário E2E',
      formVersion: 1,
      formTemplateVersion: {
        id: 'seed-v1',
        version: 1,
        template: { id: 'seed', name: 'Prontuário E2E', status: 'publicado' },
      },
      consentStatus: 'pendente',
      consentReady: false,
      aiReadiness: 'preparacao_pendente',
      aiReady: false,
      scheduleId: agenda.id,
      scheduleTitle: agenda.title,
      scheduleSpecialty: agenda.specialty,
      scheduleSpecialtyCode: agenda.specialtyCode,
      scheduleFormTemplateId: agenda.formTemplateId,
    } : null

    return fulfillJson(route, {
      date,
      allowed: true,
      reason: null,
      isHoliday: false,
      agenda,
      enabledShiftCount: 1,
      maxAppointmentsPerDay: 8,
      occupiedCount: appointment ? 1 : 0,
      appointments: appointment ? [appointment] : [],
      slots: [
        {
          shiftId: 'manha',
          shiftLabel: 'Manhã',
          label: '09:00',
          localDateTime: `${date}T09:00`,
          isoDateTime: `${date}T12:00:00.000Z`,
          available: !appointment,
          appointment,
        },
        {
          shiftId: 'manha',
          shiftLabel: 'Manhã',
          label: '09:30',
          localDateTime: `${date}T09:30`,
          isoDateTime: `${date}T12:30:00.000Z`,
          available: true,
          appointment: null,
        },
      ],
    })
  })
}

test('agenda organiza período e abre a configuração do formulário efetivo', async ({ page }) => {
  await mockAgenda(page)
  await page.goto('/agendas/agenda-psi')

  await expect(page.getByRole('heading', { name: 'Agenda Psicologia' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Navegação por período' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /domingo, 19 de julho de 2026/i })).toBeVisible()

  const formLink = page.getByRole('link', { name: 'Configurar formulário' })
  await expect(formLink).toHaveAttribute('href', '/formularios/seed')
  await expect(
    page.getByRole('region', { name: 'Agenda Psicologia' }).getByText('Prontuário E2E', { exact: true })
  ).toBeVisible()

  await expect(page.getByRole('button', { name: 'Mais ações para Paciente Teste' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remarcar' })).toBeHidden()
  await page.getByRole('button', { name: 'Mais ações para Paciente Teste' }).click()
  await expect(page.getByRole('menuitem', { name: 'Editar modelo' })).toHaveAttribute('href', '/formularios/seed')
  await expect(page.getByRole('menuitem', { name: 'Remarcar' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem', { name: 'Remarcar' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Mais ações para Paciente Teste' })).toBeFocused()

  const hasGlobalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  )
  expect(hasGlobalOverflow).toBe(false)
})
