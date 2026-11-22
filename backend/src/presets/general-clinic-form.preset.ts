import {
  ClinicalAiPolicy,
  ClinicalFieldDefinition,
  ClinicalFormDefinition,
  parseFormDefinition,
} from '../services/clinical-forms.service'

type SemanticRole = NonNullable<ClinicalFieldDefinition['semanticRole']>

const EVIDENCIAS_NUCLEARES = [
  'Fala literalmente atribuida ao paciente identificado e autorizado, quando compativel com o campo',
  'Observacao ou achado explicitamente verbalizado pelo profissional durante a consulta',
]

const EVIDENCIAS_PARA_REVISAO = [
  'Relato clinicamente relevante de acompanhante ou relacao contextual, sempre como sugestao com fonte atribuida e revisao obrigatoria',
  'Fala clinicamente relevante de voz nao identificada, somente como sugestao atribuida a voz nao identificada e com revisao obrigatoria',
]

const INFERENCIAS_PROIBIDAS = [
  'Nao inventar achados, diagnosticos, exames, doses, condutas ou informacoes ausentes',
  'Nao transformar hipotese em diagnostico confirmado',
  'Nao usar acompanhante, relacao contextual ou voz desconhecida para preenchimento automatico ou como se fossem o paciente',
  'Nao usar fala irrelevante para a consulta nem fala de participante que recusou ou nao possui autorizacao vigente',
]

function politicaIa(
  mode: ClinicalAiPolicy['mode'],
  description: string,
  expectedFormat = 'Texto clinico objetivo em portugues do Brasil, fiel as evidencias da consulta'
): ClinicalAiPolicy {
  if (mode === 'sem_acesso') return { mode }
  return {
    mode,
    description,
    allowedEvidence: [...EVIDENCIAS_NUCLEARES, ...EVIDENCIAS_PARA_REVISAO],
    prohibitedInferences: INFERENCIAS_PROIBIDAS,
    expectedFormat,
    examples: [
      'Paciente ou profissional identificado pode sustentar a operacao compativel configurada para o campo',
      'Acompanhante, relacao contextual ou voz nao identificada pode sustentar somente sugestao atribuida com revisao obrigatoria',
    ],
    counterexamples: [
      'Nao completar lacunas com conhecimento geral ou suposicoes clinicas',
      'Nao converter relato de acompanhante ou voz desconhecida em fato confirmado do paciente',
    ],
  }
}

function campos(
  specs: Array<{
    id: string
    label: string
    role: SemanticRole
    type?: ClinicalFieldDefinition['type']
    required?: boolean
    mode?: ClinicalAiPolicy['mode']
    description: string
    height?: number
  }>,
  color: ClinicalFieldDefinition['color']
): ClinicalFieldDefinition[] {
  let y = 24
  return specs.map((spec, index) => {
    const height = spec.height || (spec.type === 'texto_curto' ? 96 : 144)
    const field: ClinicalFieldDefinition = {
      id: spec.id,
      label: spec.label,
      type: spec.type || 'texto_longo',
      color,
      required: Boolean(spec.required),
      semanticRole: spec.role,
      layout: {
        x: 24,
        y,
        width: 1152,
        height,
        zIndex: 0,
        mobileOrder: index,
      },
      ai: politicaIa(spec.mode || 'preencher', spec.description),
    }
    y += height + 16
    return field
  })
}

const definition: ClinicalFormDefinition = {
  schemaVersion: 'clinical-form-v1',
  name: 'Prontuário essencial de Clínica Geral',
  specialtyCode: 'clinica_geral',
  defaultDocumentFormat: 'SOAP',
  documents: [
    {
      id: 'prontuario-compartilhavel',
      kind: 'compartilhavel',
      label: 'Prontuário clínico',
      icon: 'Stethoscope',
      color: 'azul',
      tabs: [
        {
          id: 'anamnese',
          label: 'Anamnese',
          icon: 'ClipboardList',
          color: 'azul',
          elements: campos([
            {
              id: 'identificacao-contexto-clinico',
              label: 'Identificação e contexto do atendimento',
              role: 'identificacao',
              required: true,
              description: 'Registra identificacao e contexto essencial deste atendimento',
            },
            {
              id: 'queixa-historia-clinica',
              label: 'Queixa principal e história da doença atual',
              role: 'queixa_historia_clinica',
              required: true,
              description: 'Organiza a queixa principal, cronologia, sintomas e fatores associados relatados',
            },
            {
              id: 'antecedentes-clinicos',
              label: 'Antecedentes pessoais e familiares',
              role: 'antecedentes_clinicos',
              description: 'Registra antecedentes, cirurgias, internacoes, alergias e historia familiar explicitamente informados',
            },
            {
              id: 'medicamentos-em-uso',
              label: 'Medicamentos em uso',
              role: 'medicamentos',
              mode: 'sugerir_revisao',
              description: 'Registra medicamentos, doses e frequencias exatamente como relatados, sempre para revisao profissional',
            },
            {
              id: 'revisao-de-sistemas',
              label: 'Revisão de sistemas',
              role: 'revisao_sistemas',
              description: 'Resume achados positivos e negativos explicitamente investigados por sistema',
            },
          ], 'azul'),
        },
        {
          id: 'exame-diagnostico',
          label: 'Exame e diagnóstico',
          icon: 'Activity',
          color: 'verde',
          elements: campos([
            {
              id: 'exame-fisico-sinais-vitais',
              label: 'Sinais vitais e exame físico',
              role: 'exame_fisico_sinais_vitais',
              required: true,
              description: 'Registra somente sinais vitais, medidas e achados de exame explicitamente informados pelo profissional',
            },
            {
              id: 'diagnosticos-hipoteses',
              label: 'Diagnósticos e hipóteses',
              role: 'diagnostico_hipoteses',
              mode: 'sugerir_revisao',
              description: 'Organiza diagnosticos e hipoteses verbalizados, sem confirmar ou inferir por conta propria',
            },
          ], 'verde'),
        },
        {
          id: 'conduta',
          label: 'Conduta',
          icon: 'Route',
          color: 'roxo',
          elements: campos([
            {
              id: 'plano-terapeutico-conduta',
              label: 'Plano terapêutico e conduta',
              role: 'plano_terapeutico',
              required: true,
              mode: 'sugerir_revisao',
              description: 'Registra prescricoes, orientacoes, solicitacoes, encaminhamentos e retorno verbalizados pelo profissional',
            },
            {
              id: 'documentos-clinicos-emitidos',
              label: 'Documentos e solicitações emitidos',
              role: 'documentos_emitidos',
              mode: 'sugerir_revisao',
              description: 'Lista documentos, receitas, atestados e solicitacoes explicitamente emitidos no atendimento',
            },
          ], 'roxo'),
        },
      ],
    },
    {
      id: 'registro-restrito',
      kind: 'restrito',
      label: 'Anotações clínicas restritas',
      icon: 'LockKeyhole',
      color: 'cinza',
      tabs: [
        {
          id: 'anotacoes-restritas',
          label: 'Anotações restritas',
          icon: 'LockKeyhole',
          color: 'cinza',
          elements: campos([
            {
              id: 'anotacoes-tecnicas-restritas',
              label: 'Anotações técnicas privadas',
              role: 'anotacoes_tecnicas',
              mode: 'sem_acesso',
              description: 'Espaco privado do profissional, nunca preenchido pela IA',
              height: 240,
            },
          ], 'cinza'),
        },
      ],
    },
  ],
}

export const GENERAL_CLINIC_FORM_PRESET = parseFormDefinition(definition)
export const GENERAL_CLINIC_PRESET_KEY = 'clinica-geral-essencial-v1'
