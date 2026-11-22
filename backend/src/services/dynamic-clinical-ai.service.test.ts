import assert from 'node:assert/strict'
import test from 'node:test'
import { FormRuntimeManifest, buildRuntimeManifest } from './clinical-forms.service'
import { PSYCHOLOGY_FORM_PRESET } from '../presets/psychology-form.preset'
import {
  canUseSegmentForAutomaticFormFill,
  canUseSegmentForDynamicExtraction,
  canUseSegmentForFinalDocumentDraft,
  canUseSegmentForFinalClinicalOutput,
  canUseSegmentForMandatoryReviewSuggestion,
  dynamicOperationMatchesPolicy,
  extractDynamicFormDelta,
  finalDocumentContentAttributesReviewEvidence,
  selectValuesForDocument,
  validateDynamicEvidence,
  validateDynamicFieldValue,
} from './dynamic-clinical-ai.service'

const segment = {
  id: 'seg-1',
  sequence: 1,
  text: 'Paciente: eu nao tenho pensado em me machucar.',
  speakerLabel: 'A',
  speakerDisplayName: 'Paciente',
  participantId: 'participante-1',
  participantRole: 'paciente',
  participantAuthorized: true,
  startMs: 1200,
  endMs: 4200,
}

test('usa fala sem diarizacao somente como evidencia provisoria durante a sessao', () => {
  const liveSegment = {
    ...segment,
    participantId: null,
    participantRole: null,
    participantAuthorized: undefined,
    sessionProvisionallyAuthorized: true,
  }

  assert.equal(canUseSegmentForDynamicExtraction(liveSegment, {
    allowSessionProvisional: true,
  }), true)
  assert.equal(canUseSegmentForDynamicExtraction(liveSegment, {
    finalReview: true,
    allowSessionProvisional: true,
  }), false)
  assert.equal(canUseSegmentForDynamicExtraction(liveSegment), false)
  assert.equal(canUseSegmentForDynamicExtraction({
    ...liveSegment,
    sessionProvisionallyAuthorized: false,
  }, { allowSessionProvisional: true }), false)
})

test('recusa explicita nunca e contornada pela permissao provisoria da sessao', () => {
  assert.equal(canUseSegmentForDynamicExtraction({
    ...segment,
    participantAuthorized: false,
    sessionProvisionallyAuthorized: true,
  }, { allowSessionProvisional: true }), false)
  assert.equal(canUseSegmentForDynamicExtraction(segment, { finalReview: true }), true)
})

test('separa preenchimento automatico de citacao contextual e voz ambigua', () => {
  const contextualRelation = {
    ...segment,
    participantId: null,
    participantRole: 'relacao_contextual',
    participantAuthorized: undefined,
    speakerDisplayName: 'Mãe do paciente',
    sessionContextAuthorized: true,
  }
  const ambiguousVoice = {
    ...contextualRelation,
    participantRole: null,
    sessionContextAuthorized: false,
    sessionReviewAuthorized: true,
    speakerDisplayName: 'Desconhecido 1',
  }

  assert.equal(canUseSegmentForAutomaticFormFill(segment), true)
  assert.equal(canUseSegmentForAutomaticFormFill(contextualRelation), false)
  assert.equal(canUseSegmentForDynamicExtraction(contextualRelation, { finalReview: true }), false)
  assert.equal(canUseSegmentForMandatoryReviewSuggestion(contextualRelation), true)
  assert.equal(canUseSegmentForFinalDocumentDraft(contextualRelation), true)
  assert.equal(canUseSegmentForFinalClinicalOutput(contextualRelation), true)
  assert.equal(canUseSegmentForAutomaticFormFill(ambiguousVoice), false)
  assert.equal(canUseSegmentForMandatoryReviewSuggestion(ambiguousVoice), true)
  assert.equal(canUseSegmentForFinalDocumentDraft(ambiguousVoice), true)

  const registeredCompanion = {
    ...segment,
    participantRole: 'acompanhante',
    speakerDisplayName: 'Acompanhante',
  }
  assert.equal(canUseSegmentForAutomaticFormFill(registeredCompanion), false)
  assert.equal(canUseSegmentForMandatoryReviewSuggestion(registeredCompanion), true)
  assert.equal(canUseSegmentForFinalDocumentDraft(registeredCompanion), true)

  const explicitlyUnauthorized = {
    ...contextualRelation,
    participantAuthorized: false,
  }
  assert.equal(canUseSegmentForAutomaticFormFill(explicitlyUnauthorized), false)
  assert.equal(canUseSegmentForMandatoryReviewSuggestion(explicitlyUnauthorized), false)
  assert.equal(canUseSegmentForFinalDocumentDraft(explicitlyUnauthorized), false)
})

test('voz ambigua sem consentimento de sessao permanece somente no historico', () => {
  const historyOnly = {
    ...segment,
    participantId: null,
    participantRole: null,
    participantAuthorized: undefined,
    speakerDisplayName: 'Desconhecido 1',
  }
  assert.equal(canUseSegmentForAutomaticFormFill(historyOnly), false)
  assert.equal(canUseSegmentForMandatoryReviewSuggestion(historyOnly), false)
  assert.equal(canUseSegmentForFinalDocumentDraft(historyOnly), false)
})

test('aceita operacao de sugestao para fonte review-only sem abrir escrita automatica', () => {
  assert.equal(dynamicOperationMatchesPolicy('preencher', 'preencher', true), true)
  assert.equal(dynamicOperationMatchesPolicy('preencher', 'sugerir_revisao', true), true)
  assert.equal(dynamicOperationMatchesPolicy('preencher', 'sugerir_revisao', false), false)
  assert.equal(dynamicOperationMatchesPolicy('sem_acesso', 'sugerir_revisao', true), false)
})

test('documento exige atribuicao explicita para relacao contextual e voz ambigua', () => {
  const contextual = {
    ...segment,
    participantId: null,
    participantRole: 'relacao_contextual',
    participantAuthorized: undefined,
    speakerDisplayName: 'Mãe do paciente',
    sessionContextAuthorized: true,
  }
  const contextualEvidence = validateDynamicEvidence([{
    segmentId: contextual.id,
    sequence: contextual.sequence,
    quote: 'eu nao tenho pensado em me machucar',
    speakerDisplayName: contextual.speakerDisplayName,
    startMs: contextual.startMs,
    endMs: contextual.endMs,
  }], [contextual])
  assert.equal(finalDocumentContentAttributesReviewEvidence(
    'Segundo a mãe, não houve pensamento de se machucar.',
    contextualEvidence,
    [contextual]
  ), true)
  assert.equal(finalDocumentContentAttributesReviewEvidence(
    'O paciente negou pensamento de se machucar.',
    contextualEvidence,
    [contextual]
  ), false)

  const ambiguous = {
    ...contextual,
    participantRole: null,
    speakerDisplayName: 'Desconhecido 1',
    sessionContextAuthorized: false,
    sessionReviewAuthorized: true,
  }
  const ambiguousEvidence = validateDynamicEvidence([{
    segmentId: ambiguous.id,
    sequence: ambiguous.sequence,
    quote: 'eu nao tenho pensado em me machucar',
    speakerDisplayName: ambiguous.speakerDisplayName,
    startMs: ambiguous.startMs,
    endMs: ambiguous.endMs,
  }], [ambiguous])
  assert.equal(finalDocumentContentAttributesReviewEvidence(
    'Voz não identificada informou que não houve pensamento de se machucar.',
    ambiguousEvidence,
    [ambiguous]
  ), true)
  assert.equal(finalDocumentContentAttributesReviewEvidence(
    'O paciente negou pensamento de se machucar.',
    ambiguousEvidence,
    [ambiguous]
  ), false)
})

test('aceita somente citacao literal do segmento e da sequencia informados', () => {
  const valid = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'eu nao tenho pensado em me machucar',
    speakerDisplayName: 'Paciente',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.equal(valid.length, 1)

  const invented = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'eu quero me machucar',
    speakerDisplayName: 'Paciente',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.deepEqual(invented, [])

  const contextless = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'nao',
    speakerDisplayName: 'Paciente',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.deepEqual(contextless, [])
})

test('usa pergunta anterior apenas como contexto literal para resposta curta nova', () => {
  const contextQuestion = {
    ...segment,
    id: 'seg-contexto',
    sequence: 1,
    text: 'Usa losartana?',
    contextOnly: true,
  }
  const shortAnswer = {
    ...segment,
    id: 'seg-resposta',
    sequence: 2,
    text: 'Sim',
  }
  const withContext = validateDynamicEvidence([{
    segmentId: contextQuestion.id,
    sequence: contextQuestion.sequence,
    quote: 'Usa losartana?',
    speakerDisplayName: 'Profissional',
    startMs: null,
    endMs: null,
  }, {
    segmentId: shortAnswer.id,
    sequence: shortAnswer.sequence,
    quote: 'Sim',
    speakerDisplayName: 'Paciente',
    startMs: null,
    endMs: null,
  }], [contextQuestion, shortAnswer])

  assert.deepEqual(withContext.map((item) => item.segmentId), [
    'seg-contexto',
    'seg-resposta',
  ])
  assert.deepEqual(validateDynamicEvidence([{
    segmentId: shortAnswer.id,
    sequence: shortAnswer.sequence,
    quote: 'Sim',
    speakerDisplayName: 'Paciente',
    startMs: null,
    endMs: null,
  }], [shortAnswer]), [])
})

test('nao aceita horario ou nome de falante inventado pela IA como proveniencia', () => {
  const evidence = validateDynamicEvidence([{
    segmentId: 'seg-sem-tempo',
    sequence: 2,
    quote: 'relato suficientemente longo para validacao literal',
    speakerDisplayName: 'Falante inventado',
    startMs: 99_000,
    endMs: 101_000,
  }], [{
    id: 'seg-sem-tempo',
    sequence: 2,
    text: 'Paciente: relato suficientemente longo para validacao literal.',
    participantAuthorized: true,
  }])

  assert.equal(evidence.length, 1)
  assert.equal(evidence[0]?.speakerLabel, null)
  assert.equal(evidence[0]?.speakerDisplayName, null)
  assert.equal(evidence[0]?.startMs, null)
  assert.equal(evidence[0]?.endMs, null)
})

test('nao envia fala desconhecida sem base de sessao ao motor de extracao', async () => {
  const manifest: FormRuntimeManifest = {
    schemaVersion: 'clinical-form-v1',
    specialtyCode: 'psicologia',
    templateName: 'Teste seguro',
    defaultDocumentFormat: 'SOAP',
    documents: [{
      id: 'compartilhavel',
      kind: 'compartilhavel',
      label: 'Prontuario',
      fields: [{
        id: 'demanda',
        tabId: 'demanda',
        label: 'Demanda',
        type: 'texto_longo',
        semanticRole: 'demanda_objetivos',
        required: false,
        ai: {
          mode: 'preencher',
          description: 'Demanda explicitamente relatada',
          allowedEvidence: ['Fala literal autorizada'],
          prohibitedInferences: ['Nao inferir diagnostico'],
          expectedFormat: 'Texto curto',
          examples: ['Relato literal'],
          counterexamples: ['Informacao inventada'],
        },
      }],
    }, {
      id: 'restrito',
      kind: 'restrito',
      label: 'Registro restrito',
      fields: [],
    }],
  }

  const result = await extractDynamicFormDelta({
    ownerId: 'profissional-1',
    templateVersionKey: 'versao-1',
    manifest,
    currentValues: {},
    segments: [{
      ...segment,
      participantId: null,
      participantRole: null,
      participantAuthorized: undefined,
    }],
  })

  assert.deepEqual(result.updates, [])
  assert.deepEqual(result.quarantine, [])
})

test('mantem bloqueante a fala de participante mapeado que recusou autorizacao', async () => {
  const manifest: FormRuntimeManifest = {
    schemaVersion: 'clinical-form-v1',
    specialtyCode: 'clinica_geral',
    templateName: 'Teste de autorizacao explicita',
    defaultDocumentFormat: 'SOAP',
    documents: [{
      id: 'compartilhavel',
      kind: 'compartilhavel',
      label: 'Prontuario',
      fields: [],
    }, {
      id: 'restrito',
      kind: 'restrito',
      label: 'Registro restrito',
      fields: [],
    }],
  }

  const result = await extractDynamicFormDelta({
    ownerId: 'profissional-1',
    templateVersionKey: 'versao-1',
    manifest,
    currentValues: {},
    segments: [{ ...segment, participantAuthorized: false }],
  })

  assert.equal(result.quarantine[0]?.kind, 'falante_nao_autorizado')
})

test('documento compartilhavel nunca recebe valor do registro restrito', () => {
  const manifest = buildRuntimeManifest(PSYCHOLOGY_FORM_PRESET)
  const selected = selectValuesForDocument(manifest, 'compartilhavel', {
    'demanda-principal': 'Queixa compartilhavel',
    'formulacao-clinica': 'Conteudo tecnico restrito',
  })
  assert.deepEqual(selected, { 'demanda-principal': 'Queixa compartilhavel' })
})

const baseField: FormRuntimeManifest['documents'][number]['fields'][number] = {
  id: 'campo-teste',
  tabId: 'aba-teste',
  label: 'Campo de teste',
  type: 'texto_curto',
  required: false,
  ai: { mode: 'sem_acesso' },
}

test('valida datas reais e opcoes publicadas pelo formulario', () => {
  assert.equal(validateDynamicFieldValue({ ...baseField, type: 'data' }, '2026-02-29'), false)
  assert.equal(validateDynamicFieldValue({ ...baseField, type: 'data' }, '2028-02-29'), true)

  const selectionField = {
    ...baseField,
    type: 'selecao_unica' as const,
    options: [{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Nao' }],
  }
  assert.equal(validateDynamicFieldValue(selectionField, 'sim'), true)
  assert.equal(validateDynamicFieldValue(selectionField, 'talvez'), false)
})

test('rejeita colunas desconhecidas e obrigatorias ausentes em grupos repetiveis', () => {
  const repeater = {
    ...baseField,
    type: 'grupo_repetivel' as const,
    columns: [
      { id: 'nome', label: 'Nome', type: 'texto_curto' as const, required: true, ai: { mode: 'sem_acesso' as const } },
      { id: 'contato', label: 'Contato autorizado', type: 'checkbox' as const, required: false, ai: { mode: 'sem_acesso' as const } },
    ],
  }

  assert.equal(validateDynamicFieldValue(repeater, [{ contato: true }]), false)
  assert.equal(validateDynamicFieldValue(repeater, [{ nome: 'Ana', desconhecido: 'x' }]), false)
  assert.equal(validateDynamicFieldValue(repeater, [{ nome: 'Ana', contato: true }]), true)
  assert.equal(validateDynamicFieldValue({ ...repeater, required: true }, []), false)
})
