import assert from 'node:assert/strict'
import test from 'node:test'
import { buildFieldMetaMap, FieldProvenance } from './extraction.service'

function provenance(quote: string): FieldProvenance {
  return {
    field: 'chiefComplaint',
    status: 'suggested',
    source: 'patient',
    speaker: 'Paciente',
    confidence: 'high',
    requiresReview: false,
    evidence: [{ segmentId: 'segmento-1', sequence: 1, quote }],
  }
}

test('aceita evidencia somente quando a citacao existe no segmento', () => {
  const result = buildFieldMetaMap(
    [provenance('Estou com dificuldade para dormir')],
    [{ id: 'segmento-1', sequence: 1, text: 'Paciente: Estou com dificuldade para dormir.' }]
  )

  assert.equal(result.chiefComplaint?.evidence.length, 1)
})

test('rejeita citacao inventada mesmo quando id e sequencia coincidem', () => {
  const result = buildFieldMetaMap(
    [provenance('Tenho febre alta ha tres dias')],
    [{ id: 'segmento-1', sequence: 1, text: 'Paciente: Estou com dificuldade para dormir.' }]
  )

  assert.deepEqual(result, {})
})

test('nao usa o unico segmento como fallback para uma citacao ausente', () => {
  const item = provenance('Texto que nao foi dito')
  item.evidence[0].segmentId = 'segmento-inexistente'

  const result = buildFieldMetaMap(
    [item],
    [{ id: 'segmento-1', sequence: 1, text: 'Paciente: Outro conteudo.' }]
  )

  assert.deepEqual(result, {})
})
