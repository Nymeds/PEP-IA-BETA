import assert from 'node:assert/strict'
import test from 'node:test'
import { staleAiValuesAfterFullReconciliation } from './dynamic-ai-reconciliation.service'

test('remove valor provisorio sem suporte depois da identificacao final das vozes', () => {
  const existing = [{
    id: 'provisorio-sem-suporte',
    fieldId: 'queixa-principal',
    document: { kind: 'compartilhavel' },
  }, {
    id: 'mantido-com-evidencia',
    fieldId: 'sintomas',
    document: { kind: 'compartilhavel' },
  }]
  const stale = staleAiValuesAfterFullReconciliation(existing, [{
    documentKind: 'compartilhavel',
    fieldId: 'sintomas',
    aiMode: 'preencher',
    reviewStatus: 'nao_revisado',
  }])

  assert.deepEqual(stale.map((value) => value.id), ['provisorio-sem-suporte'])
})

test('nao considera sugestao pendente como evidencia para reter valor no PEP', () => {
  const stale = staleAiValuesAfterFullReconciliation([{
    id: 'valor-antigo',
    fieldId: 'hipotese',
    document: { kind: 'restrito' },
  }], [{
    documentKind: 'restrito',
    fieldId: 'hipotese',
    aiMode: 'sugerir_revisao',
    reviewStatus: 'revisao_obrigatoria',
  }])

  assert.deepEqual(stale.map((value) => value.id), ['valor-antigo'])
})
