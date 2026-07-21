import assert from 'node:assert/strict'
import test from 'node:test'
import { FormRuntimeManifest, buildRuntimeManifest } from './clinical-forms.service'
import { PSYCHOLOGY_FORM_PRESET } from '../presets/psychology-form.preset'
import {
  extractDynamicFormDelta,
  selectValuesForDocument,
  validateDynamicEvidence,
  validateDynamicFieldValue,
} from './dynamic-clinical-ai.service'

const segment = {
  id: 'seg-1',
  sequence: 1,
  text: 'Paciente: eu nao tenho pensado em me machucar.',
  speakerLabel: 'A',
  participantId: 'participante-1',
  participantRole: 'paciente',
  participantAuthorized: true,
  startMs: 1200,
  endMs: 4200,
}

test('aceita somente citacao literal do segmento e da sequencia informados', () => {
  const valid = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'eu nao tenho pensado em me machucar',
    speakerLabel: 'A',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.equal(valid.length, 1)

  const invented = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'eu quero me machucar',
    speakerLabel: 'A',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.deepEqual(invented, [])

  const contextless = validateDynamicEvidence([{
    segmentId: 'seg-1',
    sequence: 1,
    quote: 'nao',
    speakerLabel: 'A',
    startMs: 1200,
    endMs: 4200,
  }], [segment])
  assert.deepEqual(contextless, [])
})

test('nao aceita horario ou falante inventado pela IA como proveniencia', () => {
  const evidence = validateDynamicEvidence([{
    segmentId: 'seg-sem-tempo',
    sequence: 2,
    quote: 'relato suficientemente longo para validacao literal',
    speakerLabel: 'Falante inventado',
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
  assert.equal(evidence[0]?.startMs, null)
  assert.equal(evidence[0]?.endMs, null)
})

test('nao envia fala desconhecida ou nao autorizada ao motor de extracao', async () => {
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
  assert.equal(result.quarantine.length, 1)
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
