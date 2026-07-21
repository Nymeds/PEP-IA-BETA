import { expect, test, type Page, type Route } from '@playwright/test'
import type {
  ClinicalFormDefinition,
  ClinicalFormElement,
  ClinicalFormTemplate,
  ClinicalFormVersionSummary,
} from '../src/types/forms'

const NOW = '2026-07-19T15:00:00.000Z'

function field(
  id: string,
  label: string,
  semanticRole: string,
  y: number
): ClinicalFormElement {
  return {
    id,
    label,
    semanticRole,
    type: 'texto_longo',
    color: 'azul',
    required: false,
    layout: { x: 24, y, width: 640, height: 88, zIndex: 0, mobileOrder: y / 104 },
    ai: { mode: 'sem_acesso' },
  }
}

function validDefinition(name = 'Prontuário E2E'): ClinicalFormDefinition {
  return {
    schemaVersion: 'clinical-form-v1',
    name,
    specialtyCode: 'psicologia',
    defaultDocumentFormat: 'SOAP',
    documents: [
      {
        id: 'prontuario-compartilhavel',
        kind: 'compartilhavel',
        label: 'Prontuário compartilhável',
        icon: 'ClipboardList',
        color: 'azul',
        tabs: [{
          id: 'registro-clinico',
          label: 'Registro clínico',
          icon: 'ClipboardList',
          color: 'azul',
          elements: [
            field('identificacao', 'Identificação', 'identificacao', 24),
            field('demanda', 'Demanda e objetivos', 'demanda_objetivos', 128),
            field('evolucao', 'Evolução e procedimentos', 'evolucao_procedimentos', 232),
            field('encerramento', 'Encaminhamento e encerramento', 'encaminhamento_encerramento', 336),
            field('documentos', 'Documentos emitidos', 'documentos_emitidos', 440),
          ],
        }],
      },
      {
        id: 'registro-restrito',
        kind: 'restrito',
        label: 'Registro psicológico restrito',
        icon: 'LockKeyhole',
        color: 'roxo',
        tabs: [{
          id: 'avaliacao',
          label: 'Avaliação psicológica',
          icon: 'Files',
          color: 'roxo',
          elements: [field('materiais', 'Materiais de avaliação', 'materiais_avaliacao_psicologica', 24)],
        }],
      },
    ],
  }
}

function invalidDefinition(name = 'Rascunho incompleto'): ClinicalFormDefinition {
  const title = (id: string, label: string): ClinicalFormElement => ({
    id,
    label,
    type: 'titulo',
    color: 'azul',
    required: false,
    layout: { x: 24, y: 24, width: 384, height: 64, zIndex: 0, mobileOrder: 0 },
    ai: { mode: 'sem_acesso' },
  })
  return {
    schemaVersion: 'clinical-form-v1',
    name,
    specialtyCode: 'psicologia',
    defaultDocumentFormat: 'SOAP',
    documents: [
      {
        id: 'prontuario-compartilhavel',
        kind: 'compartilhavel',
        label: 'Prontuário compartilhável',
        icon: 'ClipboardList',
        color: 'azul',
        tabs: [{ id: 'inicio', label: 'Início', icon: 'ClipboardList', color: 'azul', elements: [title('titulo-inicio', 'Início')] }],
      },
      {
        id: 'registro-restrito',
        kind: 'restrito',
        label: 'Registro psicológico restrito',
        icon: 'LockKeyhole',
        color: 'roxo',
        tabs: [{ id: 'restrito', label: 'Restrito', icon: 'LockKeyhole', color: 'roxo', elements: [title('titulo-restrito', 'Registro restrito')] }],
      },
    ],
  }
}

function template(
  id: string,
  definition: ClinicalFormDefinition,
  options?: { status?: ClinicalFormTemplate['status']; isDefault?: boolean; version?: number }
): ClinicalFormTemplate {
  const version = options?.version ?? 1
  const latestVersion: ClinicalFormVersionSummary | null = version
    ? { id: `${id}-v${version}`, version, publishedAt: NOW }
    : null
  return {
    id,
    name: definition.name,
    specialtyCode: 'psicologia',
    status: options?.status || 'publicado',
    origin: id === 'seed' ? 'preset_sistema' : 'usuario',
    isDefault: options?.isDefault ?? id === 'seed',
    draftDefinition: definition,
    latestVersion,
    versionCount: version,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

interface MockFormsState {
  patches: Array<{ id: string; definition: ClinicalFormDefinition }>
  publishRequests: string[]
  templates: Map<string, ClinicalFormTemplate>
}

async function mockAuthenticatedForms(page: Page): Promise<MockFormsState> {
  await page.context().addCookies([{
    name: 'pep_token',
    value: 'token-e2e-formularios',
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

  const templates = new Map<string, ClinicalFormTemplate>()
  templates.set('seed', template('seed', validDefinition(), { isDefault: true, version: 1 }))
  const state: MockFormsState = { patches: [], publishRequests: [], templates }

  await page.route('**/api/form-templates**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()

    if (path === '/api/form-templates' && method === 'GET') {
      return fulfillJson(route, { items: Array.from(state.templates.values()) })
    }

    if (path === '/api/form-templates' && method === 'POST') {
      const payload = request.postDataJSON() as { name: string }
      const created = template('novo-formulario', invalidDefinition(payload.name), {
        status: 'rascunho',
        isDefault: false,
        version: 0,
      })
      state.templates.set(created.id, created)
      return fulfillJson(route, { template: created }, 201)
    }

    const match = path.match(/^\/api\/form-templates\/([^/]+)(?:\/(publish|copy|default|archive|versions))?$/)
    if (!match) return fulfillJson(route, { error: 'Rota mockada não encontrada' }, 404)
    const [, id, action] = match
    const current = state.templates.get(id)
    if (!current) return fulfillJson(route, { error: 'Formulário não encontrado' }, 404)

    if (!action && method === 'GET') return fulfillJson(route, { template: current })
    if (!action && method === 'PATCH') {
      const payload = request.postDataJSON() as { name?: string; draftDefinition?: ClinicalFormDefinition }
      const updated: ClinicalFormTemplate = {
        ...current,
        name: payload.name || current.name,
        draftDefinition: payload.draftDefinition || current.draftDefinition,
        updatedAt: NOW,
      }
      state.templates.set(id, updated)
      if (payload.draftDefinition) state.patches.push({ id, definition: payload.draftDefinition })
      return fulfillJson(route, { template: updated })
    }
    if (action === 'publish' && method === 'POST') {
      state.publishRequests.push(id)
      const nextVersion = (current.latestVersion?.version || 0) + 1
      const published = template(id, current.draftDefinition, {
        status: 'publicado',
        isDefault: current.isDefault,
        version: nextVersion,
      })
      state.templates.set(id, published)
      return fulfillJson(route, {
        template: published,
        version: {
          id: `${id}-v${nextVersion}`,
          templateId: id,
          version: nextVersion,
          definition: published.draftDefinition,
          publishedAt: NOW,
          createdAt: NOW,
        },
      }, 201)
    }
    if (action === 'versions') return fulfillJson(route, { items: [] })
    return fulfillJson(route, { template: current })
  })

  return state
}

test('lista, cria e edita um rascunho, mas bloqueia publicação sem conteúdo mínimo', async ({ page }) => {
  test.setTimeout(60_000)
  const state = await mockAuthenticatedForms(page)

  await page.goto('/formularios')
  await expect(page.getByRole('heading', { name: 'Prontuários de Psicologia' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prontuário E2E' })).toBeVisible()
  await expect(page.getByText('Padrão', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Novo formulário' }).first().click()
  await page.getByLabel('Nome').fill('Rascunho da clínica')
  await page.getByRole('button', { name: 'Criar e editar' }).click()

  await expect(page).toHaveURL(/\/formularios\/novo-formulario$/, { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'Rascunho da clínica' })).toBeVisible()
  await page.getByRole('button', { name: /Texto curto/ }).click()
  await page.getByLabel('Rótulo').fill('Campo personalizado')

  await expect.poll(() => state.patches.some(({ definition }) =>
    definition.documents.some((document) => document.tabs.some((tab) =>
      tab.elements.some((element) => element.label === 'Campo personalizado')
    ))
  ), { timeout: 20_000 }).toBe(true)

  await page.getByRole('button', { name: 'Publicar', exact: true }).click()
  await expect(page.getByText(/pendência\(s\) impedem a publicação/)).toBeVisible()
  expect(state.publishRequests).toEqual([])
})

test('publica explicitamente uma nova versão quando o conteúdo mínimo está completo', async ({ page }) => {
  const state = await mockAuthenticatedForms(page)

  await page.goto('/formularios/seed')
  await expect(page.getByRole('heading', { name: 'Prontuário E2E' })).toBeVisible()
  await page.getByRole('button', { name: 'Publicar', exact: true }).click()

  await expect(page.getByText('Versão 2 publicada')).toBeVisible()
  expect(state.publishRequests).toEqual(['seed'])
})

test('agenda de Psicologia oferece apenas formulários publicados e mostra a versão', async ({ page }) => {
  await mockAuthenticatedForms(page)
  await page.route('**/api/schedule/agendas', (route) => fulfillJson(route, { agendas: [] }))

  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Gerenciamento de agendas' })).toBeVisible()
  await page.getByRole('button', { name: 'Nova agenda' }).click()

  const selector = page.getByLabel('Formulário publicado')
  await expect(selector).toBeVisible()
  await expect(selector.getByRole('option', { name: /Prontuário E2E.*v1/ })).toBeAttached()
  await selector.selectOption('seed')
  await expect(selector).toHaveValue('seed')
  await expect(page.getByText('Prontuário E2E', { exact: true }).first()).toBeVisible()
})
