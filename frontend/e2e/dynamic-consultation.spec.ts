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

async function mockDynamicConsultation(
  page: Page,
  options?: {
    status?: Consultation['status']
    startConflict?: {
      id: string
      patientName: string
      startedAt: string
      scheduleTitle: string
    }
    configureRuntime?: (runtime: DynamicConsultationRuntime) => void
  }
) {
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
    status: options?.status || 'em_consulta',
    startedAt: options?.status === 'em_espera' || options?.status === 'scheduled' ? undefined : NOW,
    createdAt: NOW,
    updatedAt: NOW,
  }
  const runtime = createRuntime()
  options?.configureRuntime?.(runtime)
  const fieldPatches: unknown[] = []
  const state = { fieldPatches, startRequests: 0, consentRequests: 0 }

  await page.context().addCookies([
    { name: 'pep_token', value: 'e2e-token', url: 'http://127.0.0.1:3001' },
  ])
  await page.route('**/api/auth/me', (route) => fulfillJson(route, {
    user: { id: 'doctor-1', email: 'medico@teste.local', name: 'Médico', suggestedName: 'Dra. Teste' },
  }))
  await page.route('**/api/consultations/consulta-dinamica**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/start')) {
      state.startRequests += 1
      if (options?.startConflict) {
        await fulfillJson(route, {
          error: 'Já existe outra consulta em andamento para este médico',
          code: 'ACTIVE_CONSULTATION_EXISTS',
          activeConsultation: options.startConflict,
        }, 409)
        return
      }
      consultation.status = 'em_consulta'
      consultation.startedAt = NOW
      await fulfillJson(route, consultation)
      return
    }
    if (url.pathname.endsWith('/runtime')) {
      await fulfillJson(route, runtime)
      return
    }
    if (url.pathname.endsWith('/consents')) {
      state.consentRequests += 1
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
          confidence: null,
          uncertainty: null,
          history: [],
        }
      }
      await fulfillJson(route, runtime)
      return
    }
    await fulfillJson(route, consultation)
  })

  return state
}

test('modal de entrada libera somente o início e mantém os consentimentos clínicos separados', async ({ page }) => {
  const state = await mockDynamicConsultation(page, { status: 'em_espera' })
  await page.goto('/consultations/consulta-dinamica')

  const dialog = page.getByRole('dialog', { name: 'Antes de iniciar o atendimento' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Iniciar consulta' })).toBeDisabled()

  await dialog.getByRole('button', { name: 'Agora não' }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: 'Iniciar consulta' }).click()
  await expect(dialog).toBeVisible()

  await dialog.getByRole('checkbox', {
    name: /Estou ciente dos requisitos para iniciar esta consulta/i,
  }).check()
  await dialog.getByRole('checkbox', { name: /Não me lembrar novamente/i }).check()
  await dialog.getByRole('button', { name: 'Iniciar consulta' }).click()

  await expect(dialog).not.toBeVisible()
  await expect(page.getByText('Em consulta', { exact: true })).toBeVisible()
  expect(state.startRequests).toBe(1)
  expect(state.consentRequests).toBe(0)
})

test('modal orienta quando já existe outra consulta em andamento', async ({ page }) => {
  const state = await mockDynamicConsultation(page, {
    status: 'em_espera',
    startConflict: {
      id: 'consulta-ativa',
      patientName: 'Paciente em atendimento',
      startedAt: '2026-07-22T22:42:44.359Z',
      scheduleTitle: 'Agenda Clínica Geral',
    },
  })
  await page.goto('/consultations/consulta-dinamica')

  const dialog = page.getByRole('dialog', { name: 'Antes de iniciar o atendimento' })
  await dialog.getByRole('checkbox', {
    name: /Estou ciente dos requisitos para iniciar esta consulta/i,
  }).check()
  await dialog.getByRole('button', { name: 'Iniciar consulta' }).click()

  const alert = dialog.getByRole('alert')
  await expect(alert).toContainText('Outra consulta já está em andamento')
  await expect(alert).toContainText('Paciente em atendimento')
  await expect(alert.getByRole('button', { name: 'Abrir consulta em andamento' })).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(state.startRequests).toBe(1)
})

test('consulta ativa expõe a finalização e direciona para a evolução', async ({ page }) => {
  await mockDynamicConsultation(page)
  await page.goto('/consultations/consulta-dinamica')

  const finishButton = page.getByRole('button', { name: 'Finalizar atendimento' })
  await expect(finishButton).toBeVisible()
  await finishButton.click()

  const assistantPanel = page.getByRole('tabpanel')
  await expect(page.getByRole('tab', { name: 'Evolução' })).toHaveAttribute('aria-selected', 'true')
  await expect(assistantPanel.getByText('IA indisponível neste momento')).toBeVisible()
  await expect(assistantPanel.getByText('O preenchimento manual continua disponível.')).toBeVisible()
  await expect(assistantPanel.getByRole('button', { name: 'Preencher SOAP manualmente' })).toBeVisible()
})

test('histórico mantém voz desconhecida como revisão obrigatória após a identificação final', async ({ page }) => {
  await mockDynamicConsultation(page, {
    configureRuntime(runtime) {
      const professional = runtime.participants.find((item) => item.role === 'profissional')!
      const patient = runtime.participants.find((item) => item.role === 'paciente')!
      patient.authorized = true
      patient.authorizedAt = NOW
      runtime.consents = [
        {
          id: 'consent-participacao',
          consultationId: runtime.consultationId,
          participantId: patient.id,
          type: 'participacao',
          granted: true,
          termsVersion: 'v1',
          evidenceJson: null,
          recordedAt: NOW,
          revokedAt: null,
        },
        {
          id: 'consent-ia',
          consultationId: runtime.consultationId,
          participantId: null,
          type: 'transcricao_ia',
          granted: true,
          termsVersion: 'v1',
          evidenceJson: null,
          recordedAt: NOW,
          revokedAt: null,
        },
        {
          id: 'consent-audio',
          consultationId: runtime.consultationId,
          participantId: null,
          type: 'gravacao_audio',
          granted: true,
          termsVersion: 'v1',
          evidenceJson: null,
          recordedAt: NOW,
          revokedAt: null,
        },
      ]
      runtime.conversation = {
        transcript: 'Como você está? Estou melhor. Uma fala ao fundo.',
        segments: [],
        turns: [
          { speaker: 'Medico', text: 'Como você está?', diarizationLabel: 'speaker_A', roleSource: 'automatico', participantId: professional.id, participantAuthorized: true },
          { speaker: 'Paciente', text: 'Estou melhor.', diarizationLabel: 'speaker_B', roleSource: 'automatico', participantId: patient.id, participantAuthorized: true },
          {
            speaker: 'Indefinido',
            text: 'Uma fala ao fundo.',
            diarizationLabel: 'speaker_C',
            roleSource: 'desconhecido',
            sessionReviewAuthorized: true,
          },
        ],
      }
    },
  })
  await page.goto('/consultations/consulta-dinamica')

  await expect(page.getByRole('button', { name: 'Atualizar com IA' })).toBeEnabled()
  await page.getByRole('button', { name: 'Abrir histórico da conversa' }).click()

  const historyDialog = page.getByRole('dialog', { name: 'Histórico da conversa' })
  await expect(historyDialog.getByText('Profissional', { exact: true })).toBeVisible()
  await expect(historyDialog.getByText('Paciente', { exact: true })).toBeVisible()
  await expect(historyDialog.getByText('Desconhecido 1')).toBeVisible()
  await expect(historyDialog.getByText('Revisão obrigatória')).toBeVisible()
  await expect(historyDialog.getByText(/não preenche o PEP automaticamente/i)).toBeVisible()
  await expect(historyDialog.getByText('speaker_A')).toHaveCount(0)
  await expect(historyDialog.getByText('speaker_B')).toHaveCount(0)
  await expect(historyDialog.getByText('speaker_C')).toHaveCount(0)
})

test('consulta dinâmica bloqueia áudio, audita consentimentos e separa os documentos', async ({ page }, testInfo) => {
  const state = await mockDynamicConsultation(page)
  await page.goto('/consultations/consulta-dinamica')

  const blockedRecording = page.getByRole('button', { name: /Pendências para gravar/ })
  await expect(blockedRecording).toBeDisabled()

  await page.getByRole('button', { name: 'Registrar consentimentos' }).click()
  const assistantPanel = page.getByRole('tabpanel')
  await expect(assistantPanel.getByText('Gravação de áudio', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Consentimentos' })).toHaveAttribute('aria-selected', 'true')

  await assistantPanel.getByText('Gravação de áudio', { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Aceitou' }).click()
  await assistantPanel.getByText('Transcrição e IA', { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Aceitou' }).click()
  await assistantPanel.getByText('Paciente Teste', { exact: true }).locator('..').locator('..').getByRole('button', { name: 'Aceitou' }).click()

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
  await expect(page.getByText('Conteúdo privativo do profissional, separado do prontuário compartilhável e de sua exportação.')).toBeVisible()
})
