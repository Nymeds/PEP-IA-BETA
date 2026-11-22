export interface DynamicReconciliationUpdate {
  documentKind: string
  fieldId: string
  aiMode: string
  reviewStatus: string
}

export interface DynamicReconciliationValue {
  id: string
  fieldId: string
  document: { kind: string }
}

/**
 * Decide quais valores ainda nao confirmados, criados pela IA, perderam suporte
 * na reinterpretacao integral. Isso inclui rascunhos preenchidos durante a
 * gravacao a partir da autorizacao provisoria da sessao.
 */
export function staleAiValuesAfterFullReconciliation<
  T extends DynamicReconciliationValue,
>(
  existingAiValues: T[],
  updates: DynamicReconciliationUpdate[]
) {
  const retainedKeys = new Set(
    updates
      .filter((update) =>
        update.aiMode !== 'sugerir_revisao' &&
        update.reviewStatus !== 'revisao_obrigatoria'
      )
      .map((update) => `${update.documentKind}:${update.fieldId}`)
  )

  return existingAiValues.filter(
    (value) => !retainedKeys.has(`${value.document.kind}:${value.fieldId}`)
  )
}
