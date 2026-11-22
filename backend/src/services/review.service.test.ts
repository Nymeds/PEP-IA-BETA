import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DialogueTurn,
  applySpeakerAssignments,
  normalizeSpeakerAssignments,
} from './review.service'

function turn(diarizationLabel: string, text: string): DialogueTurn {
  return {
    speaker: 'Indefinido',
    diarizationLabel,
    text,
  }
}

test('classifica um profissional e um paciente e anonimiza as vozes adicionais', () => {
  const turns = [
    turn('speaker_0', 'O que trouxe voce a consulta hoje?'),
    turn('speaker_1', 'Eu estou com dor de cabeca ha tres dias.'),
    turn('speaker_2', 'Eu sou acompanhante e ajudei com os remedios.'),
  ]
  const assignments = normalizeSpeakerAssignments(turns, [
    { diarizationLabel: 'speaker_0', role: 'Profissional', confidence: 0.97 },
    { diarizationLabel: 'speaker_1', role: 'Paciente', confidence: 0.94 },
    { diarizationLabel: 'speaker_2', role: 'Desconhecido', confidence: 0.91 },
  ])

  assert.deepEqual(assignments.map((item) => ({
    label: item.diarizationLabel,
    name: item.speakerDisplayName,
    role: item.role,
    source: item.roleSource,
  })), [
    { label: 'speaker_0', name: 'Profissional', role: 'Profissional', source: 'automatico' },
    { label: 'speaker_1', name: 'Paciente', role: 'Paciente', source: 'automatico' },
    { label: 'speaker_2', name: 'Desconhecido 1', role: 'Desconhecido', source: 'desconhecido' },
  ])

  const enriched = applySpeakerAssignments(turns, assignments)
  assert.deepEqual(enriched.map((item) => item.speaker), ['Medico', 'Paciente', 'Indefinido'])
  assert.deepEqual(enriched.map((item) => item.speakerDisplayName), [
    'Profissional',
    'Paciente',
    'Desconhecido 1',
  ])
})

test('nao escolhe um papel principal quando ha dois candidatos confiantes', () => {
  const turns = [
    turn('A', 'Vou orientar o tratamento.'),
    turn('B', 'Eu sinto falta de ar.'),
    turn('C', 'Vou solicitar o exame.'),
  ]
  const assignments = normalizeSpeakerAssignments(turns, [
    { diarizationLabel: 'A', role: 'Profissional', confidence: 0.96 },
    { diarizationLabel: 'B', role: 'Paciente', confidence: 0.95 },
    { diarizationLabel: 'C', role: 'Profissional', confidence: 0.93 },
  ])

  assert.deepEqual(assignments.map((item) => item.speakerDisplayName), [
    'Desconhecido 1',
    'Paciente',
    'Desconhecido 2',
  ])
})

test('rebaixa baixa confianca, rotulo inventado e resposta duplicada para desconhecido', () => {
  const turns = [turn('A', 'Trecho da primeira voz.'), turn('B', 'Trecho da segunda voz.')]
  const assignments = normalizeSpeakerAssignments(turns, [
    { diarizationLabel: 'A', role: 'Profissional', confidence: 0.4 },
    { diarizationLabel: 'B', role: 'Paciente', confidence: 0.95 },
    { diarizationLabel: 'B', role: 'Profissional', confidence: 0.99 },
    { diarizationLabel: 'ROTULO_INVENTADO', role: 'Paciente', confidence: 1 },
  ])

  assert.deepEqual(assignments.map((item) => item.speakerDisplayName), [
    'Desconhecido 1',
    'Desconhecido 2',
  ])
  assert.equal(assignments.some((item) => item.diarizationLabel === 'ROTULO_INVENTADO'), false)
})

test('exibe relacao contextual sustentada sem inferir identidade civil', () => {
  const turns = [
    turn('A', 'Vou examinar agora.'),
    turn('B', 'Estou sentindo dor desde ontem.'),
    turn('C', 'Sou a mae dele e acompanho o uso dos medicamentos.'),
    turn('D', 'Trecho ambiguo de outra voz.'),
  ]
  const assignments = normalizeSpeakerAssignments(turns, [
    { diarizationLabel: 'A', role: 'Profissional', confidence: 0.98 },
    { diarizationLabel: 'B', role: 'Paciente', confidence: 0.96 },
    {
      diarizationLabel: 'C',
      role: 'Desconhecido',
      confidence: 0.93,
      contextualLabel: 'Mãe do paciente',
    },
    {
      diarizationLabel: 'D',
      role: 'Desconhecido',
      confidence: 0.4,
      contextualLabel: 'Acompanhante',
    },
  ])

  assert.deepEqual(assignments.map((item) => item.speakerDisplayName), [
    'Profissional',
    'Paciente',
    'Mãe do paciente',
    'Desconhecido 2',
  ])
  assert.equal(assignments[2]?.role, 'Desconhecido')
  assert.equal(assignments[2]?.roleSource, 'automatico')
  assert.equal(assignments[2]?.contextualRelation, 'Mãe do paciente')
  assert.equal(applySpeakerAssignments(turns, assignments)[2]?.speaker, 'Terceiro')
})
