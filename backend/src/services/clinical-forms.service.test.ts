import assert from 'node:assert/strict'
import test from 'node:test'
import { PSYCHOLOGY_FORM_PRESET } from '../presets/psychology-form.preset'
import {
  ClinicalFormValidationError,
  parseDraftFormDefinition,
  parseFormDefinition,
} from './clinical-forms.service'

function presetCopy() {
  return structuredClone(PSYCHOLOGY_FORM_PRESET)
}

test('preset de Psicologia publica com dois documentos separados', () => {
  const parsed = parseFormDefinition(presetCopy())
  assert.deepEqual(parsed.documents.map((document) => document.kind).sort(), ['compartilhavel', 'restrito'])
})

test('bloqueia publicacao sem papel documental minimo', () => {
  const definition = presetCopy()
  for (const document of definition.documents) {
    for (const tab of document.tabs) {
      tab.elements = tab.elements.filter((field) => field.semanticRole !== 'documentos_emitidos')
    }
  }
  assert.throws(() => parseFormDefinition(definition), ClinicalFormValidationError)
})

test('bloqueia relacao entre prontuario compartilhavel e registro restrito', () => {
  const definition = presetCopy()
  const sharedField = definition.documents
    .find((document) => document.kind === 'compartilhavel')!
    .tabs.flatMap((tab) => tab.elements)
    .find((field) => field.id === 'demanda-principal')!
  sharedField.relationships = [{ fieldId: 'formulacao-clinica', kind: 'correlaciona_com' }]
  assert.throws(() => parseFormDefinition(definition), /nao sao permitidos/)
})

test('campos clinicos criticos nao podem ser preenchidos automaticamente', () => {
  const definition = presetCopy()
  const riskField = definition.documents
    .flatMap((document) => document.tabs)
    .flatMap((tab) => tab.elements)
    .find((field) => field.id === 'sinais-risco')!
  riskField.ai.mode = 'preencher'
  assert.throws(() => parseFormDefinition(definition), /sugerir para revisao/)
})

test('todo campo clinico publicado declara papel semantico', () => {
  const definition = presetCopy()
  const field = definition.documents[0]!.tabs[0]!.elements[0]!
  field.semanticRole = undefined
  assert.throws(() => parseFormDefinition(definition), /papel semantico/)
})

test('campos classificados como outros nunca recebem preenchimento automatico', () => {
  const definition = presetCopy()
  const field = definition.documents[0]!.tabs[0]!.elements[0]!
  field.semanticRole = 'outros'
  field.ai.mode = 'preencher'
  assert.throws(() => parseFormDefinition(definition), /sugerir para revisao/)
})

test('sanitiza delimitadores e caracteres de controle em descricoes nao confiaveis', () => {
  const definition = presetCopy()
  const field = definition.documents[0]!.tabs[0]!.elements[0]!
  field.ai.description = '```json\u0000 significado clinico literal e seguro'
  const parsed = parseFormDefinition(definition)
  const sanitized = parsed.documents[0]!.tabs[0]!.elements[0]!.ai.description
  assert.equal(sanitized?.includes('```'), false)
  assert.equal(sanitized?.includes('\u0000'), false)
})

test('rascunho aceita politica de IA incompleta, mas publicacao bloqueia', () => {
  const definition = presetCopy()
  const field = definition.documents[0]!.tabs[0]!.elements
    .find((candidate) => candidate.ai.mode !== 'sem_acesso')!
  field.ai.description = undefined
  field.ai.examples = []

  assert.doesNotThrow(() => parseDraftFormDefinition(definition))
  assert.throws(() => parseFormDefinition(definition), /significado clinico|exemplo valido/)
})

test('rascunho aceita selecao ainda sem opcoes, mas publicacao bloqueia', () => {
  const definition = presetCopy()
  const field = definition.documents
    .flatMap((document) => document.tabs)
    .flatMap((tab) => tab.elements)
    .find((candidate) => candidate.type !== 'titulo' && candidate.type !== 'divisor')! as unknown as {
      type: string
      options?: Array<{ id: string; label: string }>
    }
  field.type = 'selecao_unica'
  field.options = []

  assert.doesNotThrow(() => parseDraftFormDefinition(definition))
  assert.throws(() => parseFormDefinition(definition), /duas opcoes/)
})
