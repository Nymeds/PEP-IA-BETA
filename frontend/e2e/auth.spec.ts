import { expect, test } from '@playwright/test'

test('abre o login sem consultar uma sessão anônima', async ({ page }) => {
  let sessionRequests = 0
  await page.route('**/api/auth/me', async (route) => {
    sessionRequests += 1
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Sessão não autenticada' }),
    })
  })

  await page.goto('/login', { waitUntil: 'networkidle' })

  await expect(page.getByText('Entrar no sistema', { exact: true })).toBeVisible()
  expect(sessionRequests).toBe(0)
})

test('serve o ícone do aplicativo sem retornar 404', async ({ request }) => {
  const response = await request.get('/icon.svg')

  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('image/svg+xml')
})
