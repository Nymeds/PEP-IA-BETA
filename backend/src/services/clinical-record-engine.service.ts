import { CONSULTATION_STATUS, normalizeConsultationStatus } from '../lib/schedule'

export type ClinicalRecordMode = 'legacy' | 'dynamic'
export type ClinicalEvolutionFormat = 'SOAP' | 'DAP' | 'BIRP'

/**
 * Contrato de capacidades usado pelos controllers para escolher o motor sem
 * alterar os endpoints legados. A implementacao clinica de cada operacao fica
 * nos services especializados; este contrato concentra as regras de despacho.
 */
export interface ClinicalRecordEngine {
  readonly formMode: ClinicalRecordMode
  readonly usesRuntimeManifest: boolean
  readonly requiresRecordingConsent: boolean
  readonly evolutionFormats: readonly ClinicalEvolutionFormat[]
  canChangePinnedForm(status: string): boolean
}

export class LegacyFixedEngine implements ClinicalRecordEngine {
  readonly formMode = 'legacy' as const
  readonly usesRuntimeManifest = false
  readonly requiresRecordingConsent = false
  readonly evolutionFormats = ['SOAP'] as const

  canChangePinnedForm() {
    return false
  }
}

export class DynamicFormEngine implements ClinicalRecordEngine {
  readonly formMode = 'dynamic' as const
  readonly usesRuntimeManifest = true
  readonly requiresRecordingConsent = true
  readonly evolutionFormats = ['SOAP', 'DAP', 'BIRP'] as const

  canChangePinnedForm(status: string) {
    return normalizeConsultationStatus(status) === CONSULTATION_STATUS.WAITING
  }
}

const LEGACY_ENGINE = new LegacyFixedEngine()
const DYNAMIC_ENGINE = new DynamicFormEngine()

export function resolveClinicalRecordEngine(formMode: string | null | undefined): ClinicalRecordEngine {
  return formMode === 'dynamic' ? DYNAMIC_ENGINE : LEGACY_ENGINE
}
