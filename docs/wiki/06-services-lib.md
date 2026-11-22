# 06 — Services e lib do backend

[← Voltar ao índice](README.md)

Catálogo de referência. Os services de IA do formulário estão em [04](04-pipeline-ia.md);
os de formulário em [05](05-motor-formularios.md). Aqui ficam os demais.

## Services · [backend/src/services/](../../backend/src/services/)

### IA e linguagem

| Arquivo | Função principal | Papel |
|---------|------------------|-------|
| [dynamic-clinical-ai.service.ts](../../backend/src/services/dynamic-clinical-ai.service.ts) | `extractDynamicFormDelta` [:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992), `generateDynamicClinicalDocument` [:1417](../../backend/src/services/dynamic-clinical-ai.service.ts#L1417) | Coração da IA — ver [04](04-pipeline-ia.md) |
| [openai-responses.service.ts](../../backend/src/services/openai-responses.service.ts) | `createStructuredResponse` [:51](../../backend/src/services/openai-responses.service.ts#L51) | **Wrapper único da OpenAI Responses API**: schema JSON estruturado, `reasoningEffort`, `promptCacheKey`, `safetyIdentifier`, limpeza de resposta. Todo service de IA passa por aqui. |
| [dynamic-ai-reconciliation.service.ts](../../backend/src/services/dynamic-ai-reconciliation.service.ts) | `staleAiValuesAfterFullReconciliation` [:19](../../backend/src/services/dynamic-ai-reconciliation.service.ts#L19) | Na revisão final, descobre valores de IA que perderam suporte e devem ser removidos |
| [dynamic-longitudinal-summary.service.ts](../../backend/src/services/dynamic-longitudinal-summary.service.ts) | `summarizeDynamicLongitudinalRecord` [:38](../../backend/src/services/dynamic-longitudinal-summary.service.ts#L38) | Resumo do histórico do paciente entre consultas |
| [review.service.ts](../../backend/src/services/review.service.ts) | `diarizeAudio` [:340](../../backend/src/services/review.service.ts#L340), `diarizeTranscript` [:377](../../backend/src/services/review.service.ts#L377) | **Diarização**: separa Médico/Paciente/Terceiro/Indefinido. `normalizeSpeakerAssignments` [:141](../../backend/src/services/review.service.ts#L141), `applySpeakerAssignments` [:213](../../backend/src/services/review.service.ts#L213). Confiança mínima automática `AUTOMATIC_SPEAKER_ROLE_MIN_CONFIDENCE = 0.72` [:47](../../backend/src/services/review.service.ts#L47) |
| [speech.service.ts](../../backend/src/services/speech.service.ts) | `transcribeAudioBuffer` [:90](../../backend/src/services/speech.service.ts#L90) | Transcrição Whisper + **filtro de alucinações**; `saveFullAudio` [:138](../../backend/src/services/speech.service.ts#L138), `readFullAudio` [:152](../../backend/src/services/speech.service.ts#L152) |
| [realtime.service.ts](../../backend/src/services/realtime.service.ts) | `createRealtimeClientSecret` [:23](../../backend/src/services/realtime.service.ts#L23) | Segredo efêmero do Realtime (a chave permanente não vai ao browser) |
| [medication-reference.service.ts](../../backend/src/services/medication-reference.service.ts) | `findMedicationReference` [:98](../../backend/src/services/medication-reference.service.ts#L98) | Referência farmacológica em fonte oficial (Anvisa) |

> **`DialogueTurn`** ([review.service.ts:13](../../backend/src/services/review.service.ts#L13)) é o formato de fala diarizada; o
> controller o converte em `DynamicTranscriptSegment` via `transcriptSegmentsFromTurns`.

### Segurança, retenção e auditoria

| Arquivo | Função principal | Papel |
|---------|------------------|-------|
| [sensitive-data.service.ts](../../backend/src/services/sensitive-data.service.ts) | `protectSensitiveText` [:28](../../backend/src/services/sensitive-data.service.ts#L28) / `revealSensitiveText` [:44](../../backend/src/services/sensitive-data.service.ts#L44) | Cripto em repouso do conteúdo **restrito** e do áudio (`protectAudioBuffer` [:60](../../backend/src/services/sensitive-data.service.ts#L60)). Chave: `DATA_ENCRYPTION_KEY` |
| [retention.service.ts](../../backend/src/services/retention.service.ts) | `runRetentionCycle` [:497](../../backend/src/services/retention.service.ts#L497), `startRetentionWorker` [:582](../../backend/src/services/retention.service.ts#L582) | Motor de retenção: anonimiza prontuário, apaga áudio via fila durável (`enqueuePendingAudioDeletion` [:125](../../backend/src/services/retention.service.ts#L125), `processPendingAudioDeletions` [:152](../../backend/src/services/retention.service.ts#L152)) |
| [access-audit.service.ts](../../backend/src/services/access-audit.service.ts) | `recordSensitiveAccess` [:3](../../backend/src/services/access-audit.service.ts#L3) | Trilha de auditoria (sem conteúdo clínico) de toda leitura sensível |

Detalhes em [09 — Segurança, consentimento e retenção](09-seguranca-consentimento-retencao.md).

## Lib · [backend/src/lib/](../../backend/src/lib/)

| Arquivo | Exports-chave | Papel |
|---------|---------------|-------|
| [prisma.ts](../../backend/src/lib/prisma.ts) | `getPrisma` [:29](../../backend/src/lib/prisma.ts#L29) | **Singleton lazy** do Prisma. Resolve `DATABASE_URL` `file:` relativo ancorando em `backend/prisma/`. **Sempre** use `getPrisma()`, nunca `new PrismaClient`. |
| [auth.ts](../../backend/src/lib/auth.ts) | `hashPassword`/`verifyPassword` (scrypt), `signJwt`/`verifyJwt`, `getTokenFromRequest`, `setAuthCookie`/`clearAuthCookie` | Hash de senha, JWT e cookie `pep_token` (`AUTH_COOKIE_NAME` [:8](../../backend/src/lib/auth.ts#L8)) |
| [cookies.ts](../../backend/src/lib/cookies.ts) | `parseCookies` [:9](../../backend/src/lib/cookies.ts#L9), `serializeCookie` [:26](../../backend/src/lib/cookies.ts#L26) | Parse/serialização de cookies |
| [schedule.ts](../../backend/src/lib/schedule.ts) | `CONSULTATION_STATUS` [:8](../../backend/src/lib/schedule.ts#L8), `normalizeConsultationStatus` [:174](../../backend/src/lib/schedule.ts#L174), `generateSlotsForDate` [:327](../../backend/src/lib/schedule.ts#L327), `getDateAvailability` [:289](../../backend/src/lib/schedule.ts#L289) | **Todas** as regras de agenda: status, turnos, disponibilidade, slots. Concentre regra de horário aqui, não no controller. |
| [holidays.ts](../../backend/src/lib/holidays.ts) | `isBrazilHoliday` [:33](../../backend/src/lib/holidays.ts#L33) | Feriados brasileiros para bloquear/permitir agendamento |
| [dynamic-consent-timeline.ts](../../backend/src/lib/dynamic-consent-timeline.ts) | `consentWasGrantedAt` [:43](../../backend/src/lib/dynamic-consent-timeline.ts#L43), `estimateDialogueTurnOccurredAt` [:89](../../backend/src/lib/dynamic-consent-timeline.ts#L89) | **Linha do tempo do consentimento**: um segmento só é autorizado se o consentimento estava vigente **no momento em que a fala ocorreu**. Base de `participantWasAuthorizedAt` no controller. |

## Scripts

- [scripts/dynamic-psychology-evals.ts](../../backend/src/scripts/dynamic-psychology-evals.ts) — evals do pipeline
  de IA de Psicologia. Rode ao mexer em extração/prompt/gates.

## Testes (backend)

Arquivos `*.test.ts` rodam com o test runner do Node via `tsx`. Cobrem: `clinical-forms.service`,
`dynamic-clinical-ai.service`, `dynamic-ai-reconciliation.service`, `retention.service`,
`review.service`, `schedule`, `dynamic-consent-timeline`.

## Próximo

→ [07 — Banco de dados](07-banco-de-dados.md)
