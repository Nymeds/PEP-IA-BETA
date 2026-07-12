import {
  CLINICAL_TEMPLATES,
  ClinicalTemplateId,
  extractClinicalDelta,
} from '../services/extraction.service'

type ClinicalEvalCase = {
  id: string
  templateId: ClinicalTemplateId
  transcript: string
  expectedFields: string[]
  expectedSuggestion?: 'clarification' | 'conflict' | 'clinical_attention' | 'documentation'
  enableClinicalSuggestions?: boolean
}

const SCENARIOS = [
  {
    id: 'queixa-hda',
    transcript: 'Paciente: Estou com dor de garganta e febre ha quatro dias. Medico: A dor piora ao engolir? Paciente: Sim, piora para engolir.',
    expectedFields: ['chiefComplaint', 'hda', 'symptomStart', 'symptoms'],
  },
  {
    id: 'negacao',
    transcript: 'Paciente: Tenho tosse ha dois dias, mas nego falta de ar e dor no peito.',
    expectedFields: ['symptoms', 'systemsReview'],
  },
  {
    id: 'correcao',
    transcript: 'Paciente: A dor comecou ha uma semana. Paciente: Corrigindo, comecou ha tres dias.',
    expectedFields: ['symptomStart'],
    expectedSuggestion: 'conflict',
  },
  {
    id: 'alergia',
    transcript: 'Paciente: Tive urticaria quando usei amoxicilina. Medico: Registrar alergia a amoxicilina com urticaria.',
    expectedFields: ['allergiesDetails'],
    expectedSuggestion: 'documentation',
  },
  {
    id: 'medicacao',
    transcript: 'Paciente: Uso losartana 50 mg duas vezes ao dia por via oral.',
    expectedFields: ['currentMedications'],
    expectedSuggestion: 'documentation',
  },
  {
    id: 'sinais-vitais',
    transcript: 'Medico: Pressao arterial de 150 por 95, frequencia cardiaca 92 e saturacao 97 por cento.',
    expectedFields: ['vitalSigns'],
    expectedSuggestion: 'documentation',
  },
  {
    id: 'exame-fisico',
    transcript: 'Medico: Ao exame, paciente em bom estado geral, ausculta pulmonar sem ruidos adventicios.',
    expectedFields: ['generalState', 'physicalExam'],
    expectedSuggestion: 'documentation',
  },
  {
    id: 'lacuna',
    transcript: 'Paciente: Tenho dor de cabeca. Medico: Vamos entender melhor essa dor.',
    expectedFields: ['chiefComplaint'],
    expectedSuggestion: 'clarification',
  },
  {
    id: 'sindrome-respiratoria',
    transcript: 'Paciente: Comecou hoje de manha com garganta arranhando, depois tive calafrios, nariz entupido, dor de cabeca, fraqueza e falta de energia. Nao fumo e nao bebo. Ultimamente nao tenho comido bem. Medico: Temperatura 38 graus e peso 85 quilos. Paciente: Estou com febre, sem nausea ou vomito. Medico: Ainda nao consigo fechar um diagnostico.',
    expectedFields: [
      'chiefComplaint',
      'hda',
      'symptomStart',
      'symptoms',
      'smoking',
      'alcohol',
      'diet',
      'vitalSigns',
      'weight',
      'systemsReview',
    ],
    expectedSuggestion: 'clinical_attention',
    enableClinicalSuggestions: true,
  },
] as const

function buildCases(): ClinicalEvalCase[] {
  return (Object.keys(CLINICAL_TEMPLATES) as ClinicalTemplateId[]).flatMap((templateId) =>
    Array.from({ length: 40 }, (_, index) => {
      const scenario = SCENARIOS[index % SCENARIOS.length]
      const variant = Math.floor(index / SCENARIOS.length) + 1
      return {
        id: `${templateId}-${scenario.id}-${variant}`,
        templateId,
        transcript: `${scenario.transcript} Caso sintetico ${variant}.`,
        expectedFields: [...scenario.expectedFields],
        expectedSuggestion: 'expectedSuggestion' in scenario ? scenario.expectedSuggestion : undefined,
        enableClinicalSuggestions: 'enableClinicalSuggestions' in scenario
          ? scenario.enableClinicalSuggestions
          : undefined,
      }
    })
  )
}

async function main() {
  const cases = buildCases()
  const execute = process.argv.includes('--execute')
  const limitValue = process.argv.find((arg) => arg.startsWith('--limit='))
  const limit = limitValue ? Math.max(1, Number(limitValue.split('=')[1]) || cases.length) : cases.length
  const selectedCases = cases.slice(0, limit)

  if (!execute) {
    console.log(`Fixture clinica pronta: ${cases.length} casos sinteticos, ${cases.length / 5} por template.`)
    console.log('Use npm run eval:clinical -- --execute --limit=10 para chamar o modelo em uma amostra controlada.')
    return
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY e obrigatoria para executar a avaliacao clinica')
  }

  let expectedFieldHits = 0
  let expectedFieldTotal = 0
  let evidenceFailures = 0
  let suggestionHits = 0

  for (const testCase of selectedCases) {
    const result = await extractClinicalDelta({
      templateId: testCase.templateId,
      clinicalState: {},
      segments: [{ id: testCase.id, sequence: 1, text: testCase.transcript }],
      enableClinicalSuggestions: testCase.enableClinicalSuggestions,
    })
    const presentFields = new Set([...Object.keys(result.extracted), ...Object.keys(result.fieldMeta)])
    expectedFieldTotal += testCase.expectedFields.length
    expectedFieldHits += testCase.expectedFields.filter((field) => presentFields.has(field)).length
    evidenceFailures += Object.values(result.fieldMeta).filter((meta) => !meta.evidence.length).length
    if (testCase.expectedSuggestion && result.suggestions.some((item) => item.category === testCase.expectedSuggestion)) {
      suggestionHits += 1
    }
  }

  const fieldRecall = expectedFieldTotal ? (expectedFieldHits / expectedFieldTotal) * 100 : 0
  console.table({
    cases: selectedCases.length,
    fieldRecall: `${fieldRecall.toFixed(1)}%`,
    evidenceFailures,
    expectedSuggestionHits: suggestionHits,
  })
  if (evidenceFailures) process.exitCode = 1
}

void main()
