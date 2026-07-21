import {
  ClinicalAiPolicy,
  ClinicalFieldDefinition,
  ClinicalFormDefinition,
  parseFormDefinition,
} from '../services/clinical-forms.service'

type FieldType = ClinicalFieldDefinition['type']
type FieldColor = ClinicalFieldDefinition['color']
type SemanticRole = NonNullable<ClinicalFieldDefinition['semanticRole']>
type RepeaterColumn = NonNullable<ClinicalFieldDefinition['columns']>[number]

interface FieldSpec {
  id: string
  label: string
  type?: FieldType
  helpText?: string
  color?: FieldColor
  required?: boolean
  semanticRole?: SemanticRole
  validation?: ClinicalFieldDefinition['validation']
  relationships?: ClinicalFieldDefinition['relationships']
  mode?: ClinicalAiPolicy['mode']
  description?: string
  expectedFormat?: string
  options?: ClinicalFieldDefinition['options']
  columns?: RepeaterColumn[]
  width?: number
  height?: number
}

const EVIDENCIAS_SEGURAS = [
  'Fala literalmente atribuida ao paciente ou a participante cadastrado e autorizado',
  'Observacao explicitamente verbalizada pelo profissional durante a consulta',
]

const INFERENCIAS_PROIBIDAS = [
  'Nao diagnosticar, prescrever ou transformar hipotese em fato confirmado',
  'Nao completar lacunas, inventar detalhes ou usar fala de participante nao autorizado',
]

function politicaIa(
  mode: ClinicalAiPolicy['mode'],
  description: string,
  expectedFormat = 'Texto objetivo em portugues do Brasil, fiel a evidencia da consulta'
): ClinicalAiPolicy {
  if (mode === 'sem_acesso') return { mode }
  return {
    mode,
    description,
    allowedEvidence: EVIDENCIAS_SEGURAS,
    prohibitedInferences: INFERENCIAS_PROIBIDAS,
    expectedFormat,
    examples: ['Registrar somente o conteudo que possui evidencia identificavel na conversa'],
    counterexamples: ['Nao preencher com conhecimento geral ou com informacao ausente da consulta'],
  }
}

function coluna(
  id: string,
  label: string,
  description: string,
  options?: { type?: RepeaterColumn['type']; mode?: ClinicalAiPolicy['mode']; required?: boolean }
): RepeaterColumn {
  const mode = options?.mode || 'preencher'
  return {
    id,
    label,
    type: options?.type || 'texto_curto',
    required: options?.required || false,
    ai: politicaIa(mode, description),
  }
}

function construirCampos(specs: FieldSpec[]): ClinicalFieldDefinition[] {
  let y = 24
  return specs.map((spec, index) => {
    const height = spec.height || (spec.type === 'texto_longo' ? 144 : 88)
    const semanticRole = spec.semanticRole || 'outros'
    const aiMode = semanticRole === 'outros'
      ? spec.mode === 'sem_acesso' ? 'sem_acesso' : 'sugerir_revisao'
      : spec.mode || 'preencher'
    const field: ClinicalFieldDefinition = {
      id: spec.id,
      label: spec.label,
      type: spec.type || 'texto_longo',
      helpText: spec.helpText,
      color: spec.color || 'azul',
      required: spec.required || false,
      semanticRole,
      validation: spec.validation,
      relationships: spec.relationships,
      layout: {
        x: 24,
        y,
        width: spec.width || 760,
        height,
        zIndex: 0,
        mobileOrder: index,
      },
      options: spec.options,
      columns: spec.columns,
      ai: politicaIa(
        aiMode,
        spec.description || `Registra ${spec.label.toLocaleLowerCase('pt-BR')} conforme relatado na consulta`,
        spec.expectedFormat
      ),
    }
    y += height + 16
    return field
  })
}

function aba(
  id: string,
  label: string,
  icon: string,
  color: FieldColor,
  fields: FieldSpec[]
) {
  return { id, label, icon, color, elements: construirCampos(fields) }
}

const familiares: RepeaterColumn[] = [
  coluna('nome', 'Pessoa', 'Nome ou identificador da pessoa conforme informado pelo paciente'),
  coluna('relacao', 'Relacao', 'Vinculo familiar ou social declarado pelo paciente'),
  coluna('faixa_etaria', 'Faixa etaria', 'Faixa etaria aproximada quando mencionada'),
  coluna('convivencia', 'Convivencia', 'Forma e frequencia de convivencia relatadas'),
  coluna('papel_apoio', 'Papel de apoio', 'Papel de apoio ou tensao explicitamente relatado'),
  coluna('contexto_relevante', 'Contexto relevante', 'Fatos relevantes sobre a relacao como relato do paciente', { type: 'texto_longo' }),
  coluna('contato_autorizado', 'Contato autorizado', 'Autorizacao expressa para contato com a pessoa', { type: 'checkbox', mode: 'sugerir_revisao' }),
  coluna('fonte', 'Fonte do relato', 'Pessoa que forneceu a informacao registrada'),
  coluna('observacoes', 'Observacoes', 'Outras observacoes explicitamente relacionadas a pessoa', { type: 'texto_longo' }),
]

const medicamentos: RepeaterColumn[] = [
  coluna('nome_informado', 'Nome informado', 'Nome do medicamento exatamente como citado pelo paciente', { required: true }),
  coluna('principio_ativo', 'Principio ativo conhecido', 'Principio ativo somente quando explicitamente informado ou confirmado em fonte oficial', { mode: 'sugerir_revisao' }),
  coluna('dose', 'Dose relatada', 'Dose declarada, sem corrigir ou recomendar posologia'),
  coluna('frequencia', 'Frequencia', 'Frequencia de uso declarada pelo paciente'),
  coluna('via', 'Via', 'Via de administracao quando mencionada'),
  coluna('duracao', 'Duracao', 'Tempo de uso informado pelo paciente'),
  coluna('prescritor', 'Prescritor', 'Profissional prescritor quando citado'),
  coluna('indicacao_relatada', 'Indicacao relatada', 'Motivo de uso segundo o relato, sem validar indicacao farmacologica', { type: 'texto_longo' }),
  coluna('adesao', 'Adesao', 'Padrao de adesao explicitamente relatado'),
  coluna('efeitos_percebidos', 'Efeitos percebidos', 'Efeitos percebidos e atribuidos pelo paciente ao medicamento', { type: 'texto_longo' }),
  coluna('reacoes_adversas', 'Reacoes adversas relatadas', 'Reacoes adversas relatadas, sempre sujeitas a revisao profissional', { type: 'texto_longo', mode: 'sugerir_revisao' }),
  coluna('fatos_importantes', 'Fatos importantes', 'Outros fatos clinicamente relevantes citados sobre o medicamento', { type: 'texto_longo', mode: 'sugerir_revisao' }),
  coluna('fonte_data', 'Fonte e data', 'Fonte humana da informacao e data em que foi relatada', { mode: 'sugerir_revisao' }),
]

const definition: ClinicalFormDefinition = {
  schemaVersion: 'clinical-form-v1',
  name: 'Prontuario essencial de Psicologia',
  specialtyCode: 'psicologia',
  defaultDocumentFormat: 'SOAP',
  documents: [
    {
      id: 'prontuario-compartilhavel',
      kind: 'compartilhavel',
      label: 'Prontuario compartilhavel',
      icon: 'ClipboardList',
      color: 'azul',
      tabs: [
        aba('enquadramento', 'Enquadramento e consentimentos', 'ShieldCheck', 'azul', [
          {
            id: 'identificacao-contexto',
            label: 'Identificacao e contexto do atendimento',
            semanticRole: 'identificacao',
            required: true,
            description: 'Identifica o paciente e o contexto essencial desta consulta sem reproduzir dados desnecessarios',
          },
          {
            id: 'consentimentos-registrados',
            label: 'Consentimentos e participantes autorizados',
            semanticRole: 'enquadramento_consentimentos',
            mode: 'sugerir_revisao',
            description: 'Resume somente consentimentos expressos e participantes autorizados, exigindo confirmacao profissional',
          },
        ]),
        aba('demanda', 'Demanda e objetivos', 'Target', 'turquesa', [
          {
            id: 'demanda-principal',
            label: 'Demanda principal e expectativas',
            semanticRole: 'demanda_objetivos',
            required: true,
            validation: { minLength: 3, maxLength: 5000 },
            relationships: [{ fieldId: 'objetivos-terapeuticos', kind: 'correlaciona_com' }],
            description: 'Registra a demanda, expectativas e motivos apresentados pelo paciente para buscar atendimento',
          },
          {
            id: 'objetivos-terapeuticos',
            label: 'Objetivos construidos para o acompanhamento',
            mode: 'sugerir_revisao',
            description: 'Sugere os objetivos explicitamente pactuados entre profissional e paciente, sem criar metas novas',
          },
        ]),
        aba('contexto', 'Contexto e funcionamento', 'HeartHandshake', 'verde', [
          {
            id: 'historia-contexto-psicossocial',
            label: 'Historia e contexto psicossocial',
            semanticRole: 'contexto_funcionamento',
            mode: 'resumir',
            description: 'Resume historia da demanda, eventos de vida e contexto psicossocial relevantes relatados na consulta',
          },
          {
            id: 'rotina-funcionamento',
            label: 'Rotina, sono, alimentacao, trabalho, estudo e lazer',
            mode: 'resumir',
            description: 'Resume aspectos de rotina e funcionamento cotidiano com relevancia clinica explicitamente demonstrada',
          },
          {
            id: 'substancias-habitos',
            label: 'Substancias e outros habitos relevantes',
            mode: 'sugerir_revisao',
            description: 'Sugere registro de uso relatado de substancias e habitos relevantes sem pressupor dependencia',
          },
        ]),
        aba('familiares', 'Familiares e rede', 'Users', 'roxo', [
          {
            id: 'familiares-rede-itens',
            label: 'Familiares, pessoas significativas e rede de apoio',
            type: 'grupo_repetivel',
            semanticRole: 'familiares_rede',
            description: 'Organiza pessoas citadas e informacoes relacionais como relato do paciente, sem diagnosticar terceiros',
            columns: familiares,
            height: 360,
          },
          {
            id: 'dinamica-familiar-rede',
            label: 'Sintese da dinamica familiar e da rede',
            mode: 'resumir',
            description: 'Resume dinamicas, recursos e tensoes da rede apenas quando clinicamente relacionados a consulta',
          },
        ]),
        aba('medicamentos', 'Medicamentos', 'Pill', 'rosa', [
          {
            id: 'usa-medicamentos',
            label: 'Paciente relata uso atual de medicamentos',
            type: 'checkbox',
            semanticRole: 'medicamentos',
            mode: 'sugerir_revisao',
            description: 'Sinaliza uso atual somente quando declarado, sem inferir ausencia quando o tema nao foi abordado',
            expectedFormat: 'Booleano verdadeiro somente com evidencia afirmativa; caso contrario manter sem resposta',
          },
          {
            id: 'medicamentos-itens',
            label: 'Medicamentos relatados',
            type: 'grupo_repetivel',
            mode: 'sugerir_revisao',
            relationships: [{ fieldId: 'usa-medicamentos', kind: 'depende_de' }],
            description: 'Estrutura medicamentos citados pelo paciente sem oferecer orientacao, corrigir dose ou inventar informacao farmacologica',
            columns: medicamentos,
            height: 440,
          },
          {
            id: 'referencia-farmacologica-oficial',
            label: 'Referencia farmacologica externa',
            helpText: 'Somente uma fonte oficial da Anvisa pode alimentar este cartao.',
            mode: 'sem_acesso',
            description: 'Referencia externa separada do relato clinico',
          },
        ]),
        aba('evolucao', 'Evolucao e procedimentos', 'TrendingUp', 'turquesa', [
          {
            id: 'temas-evolucao-sessao',
            label: 'Temas, evolucao e resposta na sessao',
            semanticRole: 'evolucao_procedimentos',
            mode: 'resumir',
            required: true,
            description: 'Resume temas clinicamente relevantes, evolucao observavel e respostas relatadas durante a sessao',
          },
          {
            id: 'procedimentos-intervencoes',
            label: 'Procedimentos e intervencoes realizados',
            mode: 'sugerir_revisao',
            description: 'Sugere somente procedimentos e intervencoes que o profissional declarou ter realizado',
          },
        ]),
        aba('risco-protecao', 'Risco e protecao', 'ShieldAlert', 'vermelho', [
          {
            id: 'sinais-risco',
            label: 'Sinais de risco, vulnerabilidade ou violencia',
            semanticRole: 'risco_protecao',
            mode: 'sugerir_revisao',
            relationships: [{ fieldId: 'fatores-protecao', kind: 'correlaciona_com' }],
            description: 'Sinaliza falas explicitas sobre suicidio, autolesao, violencia ou vulnerabilidade para revisao prioritaria',
          },
          {
            id: 'fatores-protecao',
            label: 'Fatores de protecao e recursos',
            mode: 'sugerir_revisao',
            description: 'Sugere fatores protetivos explicitamente presentes no relato ou reconhecidos pelo profissional',
          },
          {
            id: 'plano-seguranca',
            label: 'Plano de seguranca confirmado pelo profissional',
            mode: 'sugerir_revisao',
            description: 'Registra somente componentes de um plano de seguranca explicitamente pactuados e confirmados',
          },
        ]),
        aba('plano', 'Plano e encerramento', 'Route', 'verde', [
          {
            id: 'plano-encaminhamentos',
            label: 'Plano, encaminhamentos e continuidade',
            semanticRole: 'encaminhamento_encerramento',
            mode: 'sugerir_revisao',
            required: true,
            description: 'Sugere plano, encaminhamentos, proxima sessao ou encerramento somente quando pactuados na consulta',
          },
          {
            id: 'tarefas-combinados',
            label: 'Combinados entre sessoes',
            mode: 'sugerir_revisao',
            description: 'Sugere tarefas e combinados explicitamente acordados, sem criar recomendacoes novas',
          },
        ]),
        aba('documentos', 'Documentos emitidos', 'FileCheck2', 'cinza', [
          {
            id: 'documentos-emitidos-registro',
            label: 'Documentos produzidos, finalidade e destinatario',
            semanticRole: 'documentos_emitidos',
            mode: 'sugerir_revisao',
            required: true,
            description: 'Registra documento emitido, data, finalidade e destinatario quando declarados pelo profissional',
          },
        ]),
      ],
    },
    {
      id: 'registro-restrito',
      kind: 'restrito',
      label: 'Registro psicologico restrito',
      icon: 'LockKeyhole',
      color: 'roxo',
      tabs: [
        aba('formulacao', 'Formulacao e hipoteses', 'BrainCircuit', 'roxo', [
          {
            id: 'formulacao-clinica',
            label: 'Formulacao clinica em construcao',
            semanticRole: 'formulacao_hipoteses',
            mode: 'sugerir_revisao',
            description: 'Organiza elementos para formulacao como hipotese provisoria, sem concluir diagnostico autonomamente',
          },
          {
            id: 'hipoteses-diferenciais',
            label: 'Hipoteses e questoes para acompanhamento',
            mode: 'sugerir_revisao',
            description: 'Sugere questoes investigativas baseadas em evidencia, sempre rotuladas como hipoteses nao confirmadas',
          },
        ]),
        aba('estado-mental', 'Observacoes e estado mental', 'ScanSearch', 'azul', [
          {
            id: 'observacoes-estado-mental',
            label: 'Observacoes do profissional e exame do estado mental',
            semanticRole: 'observacoes_estado_mental',
            mode: 'sugerir_revisao',
            description: 'Sugere organizacao somente de observacoes que o profissional verbalizou, sem inferir sinais nao observados',
          },
        ]),
        aba('risco-detalhado', 'Avaliacao detalhada de risco', 'Siren', 'vermelho', [
          {
            id: 'avaliacao-risco-detalhada',
            label: 'Avaliacao detalhada de risco e evidencias',
            semanticRole: 'avaliacao_risco_detalhada',
            mode: 'sugerir_revisao',
            description: 'Estrutura evidencias explicitas e incertezas sobre risco, exigindo confirmacao profissional prioritaria',
          },
          {
            id: 'decisao-profissional-risco',
            label: 'Decisao e conduta confirmadas pelo profissional',
            mode: 'sem_acesso',
            description: 'Campo reservado a decisao humana do profissional',
          },
        ]),
        aba('avaliacao-psicologica', 'Materiais de avaliacao', 'Files', 'amarelo', [
          {
            id: 'materiais-avaliacao',
            label: 'Materiais e resultados de avaliacao psicologica',
            semanticRole: 'materiais_avaliacao_psicologica',
            mode: 'sugerir_revisao',
            required: true,
            description: 'Organiza apenas materiais e resultados explicitamente registrados pelo profissional, sem interpretar teste autonomamente',
          },
          {
            id: 'validacao-instrumento',
            label: 'Validacao de licenca e SATEPSI',
            mode: 'sem_acesso',
            description: 'Confirmacao manual obrigatoria sobre instrumento e permissao de uso',
          },
        ]),
        aba('anotacoes-restritas', 'Anotacoes tecnicas', 'NotebookPen', 'cinza', [
          {
            id: 'anotacoes-tecnicas-restritas',
            label: 'Anotacoes tecnicas e evolucao restrita',
            semanticRole: 'anotacoes_tecnicas',
            mode: 'sugerir_revisao',
            description: 'Sugere anotacoes tecnicas restritas com evidencia, sem transferi-las ao prontuario compartilhavel',
          },
        ]),
      ],
    },
  ],
}

// O parse na carga impede que o preset do sistema derive do mesmo contrato usado pela API.
export const PSYCHOLOGY_FORM_PRESET = parseFormDefinition(definition)
export const PSYCHOLOGY_PRESET_KEY = 'psicologia-essencial-v1'
