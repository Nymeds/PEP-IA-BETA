import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redactConsultationVersionSnapshot } from './retention.service'

test('retencao redige somente a classe documental vencida e todas as copias da conversa', () => {
  const now = new Date('2046-01-02T03:04:05.000Z')
  const snapshot = JSON.stringify({
    documents: [
      { id: 'shared', kind: 'compartilhavel', fieldValues: [{ valueJson: 'relato compartilhado' }] },
      { id: 'restricted', kind: 'restrito', fieldValues: [{ valueJson: 'hipotese restrita' }] },
    ],
    generatedDocuments: [
      {
        id: 'soap',
        format: 'SOAP',
        documentKind: 'compartilhavel',
        contentJson: '{"plano":"mantido"}',
        sourceSnapshot: '{"transcriptSegments":[{"text":"conversa completa"}]}',
      },
      {
        id: 'restricted-note',
        format: 'DAP',
        documentKind: 'restrito',
        contentJson: '{"hipotese":"remover"}',
        sourceSnapshot: 'enc:v1:segredo',
      },
    ],
    quarantineItems: [{ id: 'risk', kind: 'alerta_risco', sourceText: 'conteudo sensivel' }],
    participants: [{ id: 'patient', role: 'paciente', name: 'Nome do paciente' }],
  })

  const restricted = JSON.parse(
    redactConsultationVersionSnapshot(snapshot, 'restrito', now)
  ) as Record<string, any>
  assert.equal(restricted.documents[0].fieldValues[0].valueJson, 'relato compartilhado')
  assert.deepEqual(restricted.documents[1], {
    id: 'restricted',
    kind: 'restrito',
    status: 'excluido_retencao',
    deletedAt: now.toISOString(),
  })
  assert.equal(restricted.generatedDocuments[0].contentJson, '{"plano":"mantido"}')
  assert.equal(restricted.generatedDocuments[0].sourceSnapshot, null)
  assert.equal(restricted.generatedDocuments[1].contentJson, undefined)
  assert.equal(restricted.generatedDocuments[1].sourceSnapshot, null)
  assert.equal(restricted.quarantineItems[0].sourceText, undefined)
  assert.equal(restricted.participants[0].name, 'Nome do paciente')

  const shared = JSON.parse(
    redactConsultationVersionSnapshot(JSON.stringify(restricted), 'compartilhavel', now)
  ) as Record<string, any>
  assert.equal(shared.documents[0].fieldValues, undefined)
  assert.equal(shared.participants[0].name, undefined)
  assert.equal(shared.participants[0].retentionRedacted, true)
  assert.equal(shared.retentionRedactions.length, 2)
})

test('retencao substitui snapshot invalido por trilha minima valida', () => {
  const now = new Date('2046-01-02T03:04:05.000Z')
  const result = JSON.parse(
    redactConsultationVersionSnapshot('nao-e-json', 'compartilhavel', now)
  ) as Record<string, any>
  assert.deepEqual(result.retentionRedactions, [
    { documentKind: 'compartilhavel', deletedAt: now.toISOString() },
  ])
})
