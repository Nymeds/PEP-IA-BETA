import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ user: { id: 'doctor-1', email: 'medico@teste.local', name: 'Médico', suggestedName: 'Dr(a). Teste' } }),
  }))
  await page.route('**/api/schedule/dashboard**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      month: '2026-07',
      agendas: [],
      stats: { patientsCount: 12, consultationsCount: 8, waitingConsultationsCount: 2, inProgressConsultationsCount: 1, completedConsultationsCount: 5, todayAppointmentsCount: 3 },
    }),
  }))
})

test('shell não cria overflow horizontal e navegação permanece acessível', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Olá/ })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)

  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('button', { name: 'Abrir navegação' }).click()
    await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible()
  }

  await expect(page).toHaveScreenshot(`dashboard-${testInfo.project.name}.png`, { animations: 'disabled', fullPage: true })
})
