import { expect, test, type Page, type Route } from '@playwright/test'
import type {
  ClinicalFormDefinition,
  DynamicConsultationRuntime,
  DynamicConsent,
  DynamicParticipant,
} from '../src/types/forms'
import type { Consultation } from '../src/types'

const NOW = '2026-07-19T18:00:00.000Z'

const definition: ClinicalFormDefinition = {
  schemaVersion: 'clinical-form-v1',
  name: 'Psicologia segura E2E',
  specialtyCode: 'psicologia',
  defaultDocumentFormat: 'SOAP',
  documents: [
    {
      id: 'documento-compartilhavel',
      kind: 'compartilhavel',
      label: 'Prontuário compartilhável',
      icon: 'FileText',
      color: 'azul',
      tabs: [{
        id: 'demanda',
        label: 'Demanda e objetivos',
        icon: 'Target',
        color: 'azul',
        elements: [{
          id: 'demanda-principal',
          type: 'texto_longo',
          label: 'Demanda principal',
          color: 'azul',
          required: true,
          semanticRole: 'demanda_objetivos',
          validation: { minLength: 3, maxLength: 2000 },
          relationships: [],
          layout: { x: 16, y: 16, width: 1168, height: 160, zIndex: 0, mobileOrder: 0 },
          ai: { mode: 'sugerir_revisao', description: 'Demanda relatada literalmente pelo paciente.' },
        }],
      }],
    },
    {
      id: 'documento-restrito',
      kind: 'restrito',
      label: 'Registro restrito',
      icon: 'LockKeyhole',
      color: 'roxo',
      tabs: [{
        id: 'hipoteses',
        label: 'Formulação e hipóteses',
        icon: 'Brain',
        color: 'roxo',
        elements: [{
          id: 'hipoteses-tecnicas',
          type: 'texto_longo',
          label: 'Hipóteses técnicas',
          color: 'roxo',
          required: false,
          semanticRole: 'formulacao_hipoteses',
          layout: { x: 16, y: 16, width: 1168, height: 160, zIndex: 0, mobileOrder: 0 },
          ai: { mode: 'sugerir_revisao', description: 'Hipótese não confirmada, sempre revisada.' },
        }],
      }],
    },
  ],
}

function participant(
  id: string,
  name: string,
  role: string,
  authorized: boolean
): DynamicParticipant {
  return {
    id,
    consultationId: 'consulta-dinamica',
    name,
    role,
    speakerLabel: null,
    authorized,
    authorizedAt: authorized ? NOW : null,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function createRuntime(): DynamicConsultationRuntime {
  return {
    formMode: 'dynamic',
    consultationId: 'consulta-dinamica',
    specialtyCode: 'psicologia',
    template: {
      id: 'template-1',
      name: definition.name,
      versionId: 'version-1',
      version: 1,
      checksum: 'checksum-e2e',
      defaultDocumentFormat: 'SOAP',
      latestVersionId: 'version-1',
      latestVersion: 1,
      newVersionAvailable: false,
    },
    definition,
    manifest: {},
    documents: [
      { id: 'doc-comp', kind: 'compartilhavel', title: 'Prontuário', status: 'rascunho', revision: 0, values: {} },
      { id: 'doc-rest', kind: 'restrito', title: 'Registro restrito', status: 'rascunho', revision: 0, values: {} },
    ],
    participants: [
      participant('profissional', 'Dra. Teste', 'profissional', true),
      participant('paciente', 'Paciente Teste', 'paciente', false),
    ],
    consents: [],
    quarantine: [],
    generatedDocuments: [],
    medicationReferences: [],
    conversation: { transcript: '', turns: [], segments: [] },
    canChangeForm: false,
    suppressFormChangeWarning: false,
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
}

async function mockDynamicConsultation(page: Page) {
  const consultation: Consultation = {
    id: 'consulta-dinamica',
    patientId: 'paciente-1',
    formMode: 'dynamic',
    specialtyCode: 'psicologia',
    formTemplateVersionId: 'version-1',
    patient: {
      id: 'paciente-1',
      name: 'Paciente Teste',
      createdAt: NOW,
      updatedAt: NOW,
    },
    status: 'em_consulta',
    startedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
  const runtime = createRuntime()
  const fieldPatches: unknown[] = []

  await page.context().addCookies([
    { name: 'pep_token', value: 'e2e-token', url: 'http://127.0.0.1:3001' },
  ])
  await page.route('**/api/auth/me', (route) => fulfillJson(route, {
    user: { id: 'doctor-1', email: 'medico@teste.local', name: 'Médico', suggestedName: 'Dra. Teste' },
  }))
  await page.route('**/api/consultations/consulta-dinamica**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/runtime')) {
      await fulfillJson(route, runtime)
      return
    }
    if (url.pathname.endsWith('/consents')) {
      const body = route.request().postDataJSON() as {
        type: DynamicConsent['type']
        granted: boolean
        participantId?: string
      }
      const recorded: DynamicConsent = {
        id: `consent-${runtime.consents.length + 1}`,
        consultationId: runtime.consultationId,
        participantId: body.participantId || null,
        type: body.type,
        granted: body.granted,
        termsVersion: 'v1',
        evidenceJson: null,
        recordedAt: new Date(Date.parse(NOW) + runtime.consents.length * 1000).toISOString(),
        revokedAt: null,
      }
      runtime.consents.unshift(recorded)
      if (body.type === 'participacao' && body.participantId) {
        const target = runtime.participants.find((item) => item.id === body.participantId)
        if (target) target.authorized = body.granted
      }
      await fulfillJson(route, recorded, 201)
      return
    }
    if (url.pathname.endsWith('/dynamic-fields')) {
      const body = route.request().postDataJSON() as {
        documentKind: 'compartilhavel' | 'restrito'
        changes: Array<{ fieldId: string; value: unknown }>
      }
      fieldPatches.push(body)
      const document = runtime.documents.find((item) => item.kind === body.documentKind)!
      for (const change of body.changes) {
        document.values[change.fieldId] = {
          value: change.value,
          source: 'manual',
          reviewStatus: 'confirmado',
          evidence: [],
          revision: (document.values[change.fieldId]?.revision || 0) + 1,
          updatedAt: NOW,
        }
      }
      await fulfillJson(route, runtime)
      return
    }
    await fulfillJson(route, consultation)
  })

  return { fieldPatches }
}

test('consulta dinâmica bloqueia áudio, audita consentimentos e separa os documentos', async ({ page }, testInfo) => {
  const state = await mockDynamicConsultation(page)
  await page.goto('/consultations/consulta-dinamica')

  const blockedRecording = page.getByRole('button', { name: /Registre consentimentos de áudio/ })
  await expect(blockedRecording).toBeDisabled()

  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('tab', { name: /Assistente/ }).click()
  }

  await page.getByText('Gravação de áudio', { exact: true }).locator('..').getByRole('button', { name: 'Aceitou' }).click()
  await page.getByText('Transcrição e assistência por IA', { exact: true }).locator('..').getByRole('button', { name: 'Aceitou' }).click()
  await page.getByText('Paciente Teste', { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Aceitou' }).click()

  await expect(page.getByRole('button', { name: 'Iniciar gravação' })).toBeEnabled()

  if (testInfo.project.name === 'mobile-390') {
    await page.getByRole('tab', { name: 'Formulário' }).click()
  } else if (testInfo.project.name === 'tablet-1024') {
    await page.getByRole('button', { name: 'Fechar assistente clínico' }).first().click()
  }

  await page.getByRole('textbox', { name: 'Demanda principal' }).fill('Ansiedade relatada na consulta.')
  await expect.poll(() => state.fieldPatches.length).toBe(1)

  await page.getByRole('tab', { name: 'Registro restrito', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Hipóteses técnicas' })).toBeVisible()
  await expect(page.getByText('Não é incluído no prontuário compartilhável nem em sua exportação.')).toBeVisible()
})
