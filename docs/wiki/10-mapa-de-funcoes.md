# 10 — Mapa de funções ("onde está a função que…?")

[← Voltar ao índice](README.md)

Índice **por tarefa**. Ache a função certa em segundos. Abreviações:
`DCC` = [dynamic-consultations.controller.ts](../../backend/src/controllers/dynamic-consultations.controller.ts),
`DAI` = [dynamic-clinical-ai.service.ts](../../backend/src/services/dynamic-clinical-ai.service.ts),
`CF` = [clinical-forms.service.ts](../../backend/src/services/clinical-forms.service.ts),
`FTS` = [form-templates.service.ts](../../backend/src/services/form-templates.service.ts).

## IA / interpretação

| Quero… | Função | Onde |
|--------|--------|------|
| **A IA interpreta a fala e preenche o formulário** | `reinterpretDynamicConsultation` → `runDynamicInterpretation` → `extractDynamicFormDelta` → `applyAiOutput` | DCC [:1953](../../backend/src/controllers/dynamic-consultations.controller.ts#L1953) · DCC [:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767) · DAI [:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992) · DCC [:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613) |
| Onde a IA "pensa" (prompt + schema) | `extractDynamicFormDelta` / `DYNAMIC_AI_INSTRUCTIONS` | DAI [:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992) · [:214](../../backend/src/services/dynamic-clinical-ai.service.ts#L214) |
| Onde o valor é gravado no campo | `applyAiOutput` | DCC [:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613) |
| Chamar a OpenAI (baixo nível) | `createStructuredResponse` | [openai-responses.service.ts:51](../../backend/src/services/openai-responses.service.ts#L51) |
| Gerar a evolução SOAP/DAP/BIRP | `generateDynamicDocument` → `generateDynamicClinicalDocument` | DCC [:2030](../../backend/src/controllers/dynamic-consultations.controller.ts#L2030) · DAI [:1417](../../backend/src/services/dynamic-clinical-ai.service.ts#L1417) |
| Reconciliar/remover valores de IA obsoletos | `staleAiValuesAfterFullReconciliation` | [dynamic-ai-reconciliation.service.ts:19](../../backend/src/services/dynamic-ai-reconciliation.service.ts#L19) |
| Tópicos da conversa | `suggestDynamicConversationTopics` | DAI [:1235](../../backend/src/services/dynamic-clinical-ai.service.ts#L1235) |
| Resumo longitudinal do paciente | `summarizeDynamicLongitudinalRecord` | [dynamic-longitudinal-summary.service.ts:38](../../backend/src/services/dynamic-longitudinal-summary.service.ts#L38) |
| Ajustar o cursor/lease da IA | `runDynamicInterpretation` (usa `ConsultationAiState`) | DCC [:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767) |

## Validação e barreiras (por que algo entra ou é barrado)

| Quero… | Função | Onde |
|--------|--------|------|
| Validar o valor contra o tipo do campo | `validateDynamicFieldValue` | DAI [:448](../../backend/src/services/dynamic-clinical-ai.service.ts#L448) |
| Validar citação literal | `validateDynamicEvidence` | DAI [:479](../../backend/src/services/dynamic-clinical-ai.service.ts#L479) |
| Checar suporte lexical (anti-alucinação) | `evidenceSupportsValue` | DAI [:563](../../backend/src/services/dynamic-clinical-ai.service.ts#L563) |
| Ver se a operação bate com a política do campo | `dynamicOperationMatchesPolicy` | DAI [:982](../../backend/src/services/dynamic-clinical-ai.service.ts#L982) |
| Classificar fala não nuclear (review-only) | `validateDynamicReviewOnlyAssessments` | DAI [:838](../../backend/src/services/dynamic-clinical-ai.service.ts#L838) |
| Validar alerta de risco | `validateDynamicRiskAlertCandidate` | DAI [:943](../../backend/src/services/dynamic-clinical-ai.service.ts#L943) |

## Autorização de voz / participantes / consentimento

| Quero… | Função | Onde |
|--------|--------|------|
| Saber se a voz pode **preencher** o campo | `canUseSegmentForAutomaticFormFill` | DAI [:631](../../backend/src/services/dynamic-clinical-ai.service.ts#L631) |
| Saber se a voz pode **sugerir com revisão** | `canUseSegmentForMandatoryReviewSuggestion` | DAI [:646](../../backend/src/services/dynamic-clinical-ai.service.ts#L646) |
| Saber se a voz pode entrar na **evolução** | `canUseSegmentForFinalDocumentDraft` | DAI [:663](../../backend/src/services/dynamic-clinical-ai.service.ts#L663) |
| Cadastrar/editar participante e voz | `upsertDynamicParticipant` | DCC [:1120](../../backend/src/controllers/dynamic-consultations.controller.ts#L1120) |
| Registrar consentimento | `recordDynamicConsent` | DCC [:1259](../../backend/src/controllers/dynamic-consultations.controller.ts#L1259) |
| Bloquear gravação sem consentimento | `assertDynamicRecordingConsent` | DCC [:1371](../../backend/src/controllers/dynamic-consultations.controller.ts#L1371) |
| Consentimento vigente no tempo da fala | `consentWasGrantedAt` | [dynamic-consent-timeline.ts:43](../../backend/src/lib/dynamic-consent-timeline.ts#L43) |
| Invalidar IA após revogação/remapeamento | `invalidateAiDerivedContent` | DCC [:1048](../../backend/src/controllers/dynamic-consultations.controller.ts#L1048) |
| Converter diálogo diarizado em segmentos autorizados | `transcriptSegmentsFromTurns` | DCC [:1510](../../backend/src/controllers/dynamic-consultations.controller.ts#L1510) |

## Formulário / edição manual / documentos

| Quero… | Função | Onde |
|--------|--------|------|
| Montar o estado do runtime | `getDynamicRuntime` / `runtimePayload` | DCC [:636](../../backend/src/controllers/dynamic-consultations.controller.ts#L636) · [:499](../../backend/src/controllers/dynamic-consultations.controller.ts#L499) |
| Salvar edição manual | `updateDynamicFields` / `applyManualChanges` | DCC [:785](../../backend/src/controllers/dynamic-consultations.controller.ts#L785) · [:676](../../backend/src/controllers/dynamic-consultations.controller.ts#L676) |
| Trocar a versão do formulário | `changeDynamicFormVersion` | DCC [:840](../../backend/src/controllers/dynamic-consultations.controller.ts#L840) |
| Confirmar/finalizar/adendar evolução | `confirmDynamicDocument` | DCC [:2263](../../backend/src/controllers/dynamic-consultations.controller.ts#L2263) |
| Resolver item de quarentena | `resolveDynamicQuarantine` | DCC [:2443](../../backend/src/controllers/dynamic-consultations.controller.ts#L2443) |
| Corrigir a transcrição (nova versão) | `createDynamicTranscriptVersion` | DCC [:2559](../../backend/src/controllers/dynamic-consultations.controller.ts#L2559) |
| Exportar um documento | `exportDynamicDocument` | DCC [:2727](../../backend/src/controllers/dynamic-consultations.controller.ts#L2727) |
| Validar/derivar a definição do formulário | `parseFormDefinition` / `buildRuntimeManifest` | CF [:667](../../backend/src/services/clinical-forms.service.ts#L667) · [:712](../../backend/src/services/clinical-forms.service.ts#L712) |
| Publicar um template (versão imutável) | `publishOwnedFormTemplate` | FTS [:438](../../backend/src/services/form-templates.service.ts#L438) |
| Pinar versão ao agendar | `resolvePublishedVersionForSchedule` | FTS [:601](../../backend/src/services/form-templates.service.ts#L601) |

## Transcrição / áudio / diarização

| Quero… | Função | Onde |
|--------|--------|------|
| Iniciar a consulta | `startConsultation` | [consultations.controller.ts:135](../../backend/src/controllers/consultations.controller.ts#L135) |
| Token efêmero do Realtime | `createRealtimeToken` → `createRealtimeClientSecret` | [consultations.controller.ts:285](../../backend/src/controllers/consultations.controller.ts#L285) · [realtime.service.ts:23](../../backend/src/services/realtime.service.ts#L23) |
| Persistir segmento do Realtime | `appendRealtimeTranscript` | [consultations.controller.ts:307](../../backend/src/controllers/consultations.controller.ts#L307) |
| Transcrever chunk (fallback) | `transcribeChunk` → `transcribeAudioBuffer` | [consultations.controller.ts:249](../../backend/src/controllers/consultations.controller.ts#L249) · [speech.service.ts:90](../../backend/src/services/speech.service.ts#L90) |
| Diarizar (separar falantes) | `diarizeAudio` / `diarizeTranscript` | [review.service.ts:340](../../backend/src/services/review.service.ts#L340) · [:377](../../backend/src/services/review.service.ts#L377) |

## Segurança / retenção / auditoria

| Quero… | Função | Onde |
|--------|--------|------|
| Criptografar/ler texto restrito | `protectSensitiveText` / `revealSensitiveText` | [sensitive-data.service.ts:28](../../backend/src/services/sensitive-data.service.ts#L28) · [:44](../../backend/src/services/sensitive-data.service.ts#L44) |
| Rodar o ciclo de retenção | `runRetentionCycle` / `startRetentionWorker` | [retention.service.ts:497](../../backend/src/services/retention.service.ts#L497) · [:582](../../backend/src/services/retention.service.ts#L582) |
| Registrar acesso sensível | `recordSensitiveAccess` | [access-audit.service.ts:3](../../backend/src/services/access-audit.service.ts#L3) |
| Assinar/verificar sessão | `signJwt` / `verifyJwt` | [lib/auth.ts:74](../../backend/src/lib/auth.ts#L74) · [:95](../../backend/src/lib/auth.ts#L95) |
| Acessar o banco | `getPrisma` | [lib/prisma.ts:29](../../backend/src/lib/prisma.ts#L29) |

## Agenda / pacientes

| Quero… | Função | Onde |
|--------|--------|------|
| Marcar consulta rápida | `quickBookAppointment` | [schedule.controller.ts:651](../../backend/src/controllers/schedule.controller.ts#L651) |
| Remarcar/cancelar/faltou | `updateAppointment` | [schedule.controller.ts:820](../../backend/src/controllers/schedule.controller.ts#L820) |
| Gerar slots de um dia | `generateSlotsForDate` / `getDateAvailability` | [lib/schedule.ts:327](../../backend/src/lib/schedule.ts#L327) · [:289](../../backend/src/lib/schedule.ts#L289) |
| Detectar paciente duplicado | `findPatientDuplicates` | [patients.controller.ts:172](../../backend/src/controllers/patients.controller.ts#L172) |
| Resumo do paciente | `getPatientSummary` | [patients.controller.ts:374](../../backend/src/controllers/patients.controller.ts#L374) |

## Frontend (pontos de entrada)

| Quero… | Onde |
|--------|------|
| Estado da consulta + autosave | `useDynamicConsultation` [hooks/useDynamicConsultation.ts:36](../../frontend/src/hooks/useDynamicConsultation.ts#L36) |
| Gravação/transcrição no cliente | `useRealtimeTranscription` [hooks/useRealtimeTranscription.ts:39](../../frontend/src/hooks/useRealtimeTranscription.ts#L39) |
| Chamadas HTTP da consulta | `dynamicConsultationApi` [services/dynamic-consultation-api.ts:70](../../frontend/src/services/dynamic-consultation-api.ts#L70) |
| Coordenação da tela | `DynamicConsultationView` [components/consultation/dynamic/DynamicConsultationView.tsx](../../frontend/src/components/consultation/dynamic/DynamicConsultationView.tsx) |
| Renderizar um campo | `DynamicFieldRenderer` [components/consultation/dynamic/DynamicFieldRenderer.tsx](../../frontend/src/components/consultation/dynamic/DynamicFieldRenderer.tsx) |
| Editor de formulários | `FormTemplateEditor` [components/forms/FormTemplateEditor.tsx](../../frontend/src/components/forms/FormTemplateEditor.tsx) |

---

← [09 — Segurança](09-seguranca-consentimento-retencao.md) · [Voltar ao índice](README.md)
