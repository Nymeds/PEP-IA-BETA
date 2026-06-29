import { ResponseFormatJSONSchema } from 'openai/resources/shared'

const nullableString = { type: ['string', 'null'] }
const nullableNumber = { type: ['number', 'null'] }
const nullableBoolean = { type: ['boolean', 'null'] }
const nullableStringArray = {
  anyOf: [
    { type: 'array', items: { type: 'string' } },
    { type: 'null' },
  ],
}

const systemsReviewCategories = [
  'general',
  'respiratory',
  'cardiovascular',
  'gastrointestinal',
  'genitourinary',
  'neurological',
  'psychiatric',
  'musculoskeletal',
  'dermatological',
] as const

export const clinicalFieldKeys = [
  'chiefComplaint',
  'hda',
  'symptomStart',
  'symptomIntensity',
  'symptoms',
  'improvingFactors',
  'worseningFactors',
  'previousDiseases',
  'surgeries',
  'hospitalizations',
  'allergiesDetails',
  'currentMedications',
  'familyHistory',
  'smoking',
  'alcohol',
  'physicalActivity',
  'sleep',
  'diet',
  'occupation',
  'vitalSigns',
  'weight',
  'height',
  'generalState',
  'physicalExam',
  'mainHypothesis',
  'differentials',
  'cid',
  'therapeuticPlan',
  'orientations',
  'referrals',
  'systemsReview',
  'currentSection',
] as const

const allergySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['substance', 'reaction'],
  properties: {
    substance: nullableString,
    reaction: nullableString,
  },
}

const medicationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'dose', 'frequency', 'route'],
  properties: {
    name: nullableString,
    dose: nullableString,
    frequency: nullableString,
    route: nullableString,
  },
}

const cidSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'description'],
  properties: {
    code: nullableString,
    description: nullableString,
  },
}

const familyHistorySchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['diabetes', 'hypertension', 'stroke', 'cancer', 'heartDisease'],
      properties: {
        diabetes: nullableBoolean,
        hypertension: nullableBoolean,
        stroke: nullableBoolean,
        cancer: nullableBoolean,
        heartDisease: nullableBoolean,
      },
    },
    { type: 'null' },
  ],
}

const vitalSignsSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['pa', 'fc', 'fr', 'temp', 'spo2', 'glucose'],
      properties: {
        pa: nullableString,
        fc: nullableString,
        fr: nullableString,
        temp: nullableString,
        spo2: nullableString,
        glucose: nullableString,
      },
    },
    { type: 'null' },
  ],
}

const physicalExamSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['headNeck', 'cardioRespiratory', 'abdomen', 'neurological', 'extremities'],
      properties: {
        headNeck: nullableString,
        cardioRespiratory: nullableString,
        abdomen: nullableString,
        neurological: nullableString,
        extremities: nullableString,
      },
    },
    { type: 'null' },
  ],
}

const systemsReviewSchema = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: [...systemsReviewCategories],
      properties: Object.fromEntries(
        systemsReviewCategories.map((category) => [category, nullableStringArray])
      ),
    },
    { type: 'null' },
  ],
}

export const clinicalExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [...clinicalFieldKeys],
  properties: {
    chiefComplaint: nullableString,
    hda: nullableString,
    symptomStart: nullableString,
    symptomIntensity: nullableString,
    symptoms: nullableStringArray,
    improvingFactors: nullableString,
    worseningFactors: nullableString,
    previousDiseases: nullableStringArray,
    surgeries: nullableStringArray,
    hospitalizations: nullableStringArray,
    allergiesDetails: {
      anyOf: [
        { type: 'array', items: allergySchema },
        { type: 'null' },
      ],
    },
    currentMedications: {
      anyOf: [
        { type: 'array', items: medicationSchema },
        { type: 'null' },
      ],
    },
    familyHistory: familyHistorySchema,
    smoking: nullableString,
    alcohol: nullableString,
    physicalActivity: nullableString,
    sleep: nullableString,
    diet: nullableString,
    occupation: nullableString,
    vitalSigns: vitalSignsSchema,
    weight: nullableNumber,
    height: nullableNumber,
    generalState: nullableString,
    physicalExam: physicalExamSchema,
    mainHypothesis: nullableString,
    differentials: nullableStringArray,
    cid: {
      anyOf: [
        { type: 'array', items: cidSchema },
        { type: 'null' },
      ],
    },
    therapeuticPlan: nullableString,
    orientations: nullableString,
    referrals: nullableString,
    systemsReview: systemsReviewSchema,
    currentSection: {
      anyOf: [
        {
          type: 'string',
          enum: [
            'anamnese',
            'antecedentes',
            'habitos',
            'revisao_sistemas',
            'exame_fisico',
            'diagnostico',
            'conduta',
          ],
        },
        { type: 'null' },
      ],
    },
  },
}

const fieldStateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['field', 'evidence', 'confidence', 'sourceSeqs', 'status'],
  properties: {
    field: { type: 'string', enum: [...clinicalFieldKeys] },
    evidence: nullableString,
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    sourceSeqs: { type: 'array', items: { type: 'number' } },
    status: { type: 'string', enum: ['confirmado', 'duvidoso', 'conflito'] },
  },
}

export const incrementalExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lastAnalyzedSeq', 'extracted', 'fieldStates', 'conflicts'],
  properties: {
    lastAnalyzedSeq: { type: 'number' },
    extracted: clinicalExtractionSchema,
    fieldStates: { type: 'array', items: fieldStateSchema },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['field', 'existingValue', 'newValue', 'evidence', 'sourceSeqs'],
        properties: {
          field: { type: 'string', enum: [...clinicalFieldKeys] },
          existingValue: nullableString,
          newValue: nullableString,
          evidence: nullableString,
          sourceSeqs: { type: 'array', items: { type: 'number' } },
        },
      },
    },
  },
}

export const soapSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['subjective', 'objective', 'assessment', 'plan'],
  properties: {
    subjective: { type: 'string' },
    objective: { type: 'string' },
    assessment: { type: 'string' },
    plan: { type: 'string' },
  },
}

export const diarizationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['turns'],
  properties: {
    turns: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string', enum: ['Medico', 'Paciente', 'Indefinido'] },
          text: { type: 'string' },
        },
      },
    },
  },
}

export const topicsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'summary', 'excerpts'],
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          excerpts: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export const patientSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'activeProblems', 'medications', 'allergies', 'recommendations'],
  properties: {
    overview: { type: 'string' },
    activeProblems: { type: 'array', items: { type: 'string' } },
    medications: { type: 'array', items: { type: 'string' } },
    allergies: { type: 'array', items: { type: 'string' } },
    recommendations: { type: 'string' },
  },
}

export function jsonSchemaResponseFormat(
  name: string,
  schema: Record<string, unknown>,
  description?: string
): ResponseFormatJSONSchema {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      description,
      schema,
      strict: true,
    },
  }
}

export function removeNullishAndEmpty<T>(input: T): T {
  if (Array.isArray(input)) {
    return input
      .map((item) => removeNullishAndEmpty(item))
      .filter((item) => item != null && item !== '') as T
  }

  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const clean = removeNullishAndEmpty(value)
      const isEmptyArray = Array.isArray(clean) && clean.length === 0
      const isEmptyObject =
        clean && typeof clean === 'object' && !Array.isArray(clean) && Object.keys(clean).length === 0
      if (clean == null || clean === '' || isEmptyArray || isEmptyObject) continue
      out[key] = clean
    }
    return out as T
  }

  return input
}
