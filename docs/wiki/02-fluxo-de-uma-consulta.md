# 02 — Fluxo de uma consulta (ponta a ponta)

[← Voltar ao índice](README.md)

Esta página segue **a execução real**, do agendamento à evolução confirmada, dizendo em
cada passo qual arquivo/função entra. Use-a como roteiro de leitura.

## Mapa resumido

```text
Agenda (quick-book)
  → cria Consultation pinada a uma versão de formulário
Página da consulta  frontend/src/app/consultations/[id]/page.tsx
  → DynamicConsultationView  (coordena tudo)
     ├── GET /:id/runtime         → getDynamicRuntime         (monta o estado)
     ├── consentimentos/participantes  → recordDynamicConsent / upsertDynamicParticipant
     ├── POST /:id/start          → startConsultation         (em_espera → em_consulta)
     ├── gravação + transcrição   → useRealtimeTranscription  → /realtime-transcript | /transcribe
     ├── POST /:id/dynamic-reinterpret → reinterpretDynamicConsultation  ← IA preenche o formulário
     ├── PATCH /:id/dynamic-fields → updateDynamicFields       (edição manual)
     ├── POST /:id/generated-documents → generateDynamicDocument (rascunho SOAP/DAP/BIRP)
     └── PATCH /:id/generated-documents/:docId/confirm → confirmDynamicDocument (assina/finaliza)
```

## 1. Agendar e pinar o formulário

- UI: [AgendaCalendarView.tsx](../../frontend/src/components/agendas/AgendaCalendarView.tsx) /
  [AgendaQuickScheduleModal.tsx](../../frontend/src/components/agendas/AgendaQuickScheduleModal.tsx).
- Backend: `quickBookAppointment` ([schedule.controller.ts:651](../../backend/src/controllers/schedule.controller.ts#L651)).
- A consulta nasce com `formTemplateVersionId` **pinado** à versão publicada da agenda —
  resolvido por `resolvePublishedVersionForSchedule` ([form-templates.service.ts:601](../../backend/src/services/form-templates.service.ts#L601)).
- Trocar de versão antes de iniciar: `changeDynamicFormVersion` ([dynamic-consultations.controller.ts:840](../../backend/src/controllers/dynamic-consultations.controller.ts#L840)) — só em `em_espera`.

## 2. Abrir a consulta e montar o runtime

- Página fina: [app/consultations/[id]/page.tsx](../../frontend/src/app/consultations/[id]/page.tsx) → renderiza
  [DynamicConsultationView.tsx](../../frontend/src/components/consultation/dynamic/DynamicConsultationView.tsx).
- Estado local, autosave e merge: hook [useDynamicConsultation.ts](../../frontend/src/hooks/useDynamicConsultation.ts).
- `GET /:id/runtime` → `getDynamicRuntime` ([:636](../../backend/src/controllers/dynamic-consultations.controller.ts#L636)) monta o payload:
  garante os dois documentos (`ensureDynamicDocuments` [:329](../../backend/src/controllers/dynamic-consultations.controller.ts#L329)),
  garante participantes núcleo (`ensureCoreParticipants` [:366](../../backend/src/controllers/dynamic-consultations.controller.ts#L366)),
  descriptografa o conteúdo restrito e serializa tudo em `runtimePayload` ([:499](../../backend/src/controllers/dynamic-consultations.controller.ts#L499)).

## 3. Consentimentos e participantes (pré-requisito para gravar)

- Consentimentos: `recordDynamicConsent` ([:1259](../../backend/src/controllers/dynamic-consultations.controller.ts#L1259)) —
  tipos `gravacao_audio`, `transcricao_ia`, `participacao`.
- Participantes: `upsertDynamicParticipant` ([:1120](../../backend/src/controllers/dynamic-consultations.controller.ts#L1120)).
- Antes de gravar, o backend exige consentimento válido:
  `assertDynamicRecordingConsent` ([:1371](../../backend/src/controllers/dynamic-consultations.controller.ts#L1371)).
- **Revogar** consentimento ou mudar participação **invalida** resultados anteriores da IA:
  `invalidateAiDerivedContent` ([:1048](../../backend/src/controllers/dynamic-consultations.controller.ts#L1048)).

## 4. Iniciar

- `POST /:id/start` → `startConsultation` ([consultations.controller.ts:135](../../backend/src/controllers/consultations.controller.ts#L135)):
  `em_espera` → `em_consulta`, grava `startedAt`, congela a versão do formulário.

## 5. Gravar e transcrever

- Hook: [useRealtimeTranscription.ts](../../frontend/src/hooks/useRealtimeTranscription.ts).
  1. Tenta OpenAI **Realtime** via WebRTC; token efêmero pedido em `POST /:id/realtime-token`
     → `createRealtimeToken` ([consultations.controller.ts:285](../../backend/src/controllers/consultations.controller.ts#L285))
     → `createRealtimeClientSecret` ([realtime.service.ts:23](../../backend/src/services/realtime.service.ts#L23)).
     A **chave permanente da OpenAI nunca vai ao browser**.
  2. Cada transcrição concluída → `POST /:id/realtime-transcript`
     → `appendRealtimeTranscript` ([:307](../../backend/src/controllers/consultations.controller.ts#L307)) — grava um `ConsultationTranscriptSegment`.
  3. Fallback local: se o Realtime falhar, grava o áudio e envia o blob em `POST /:id/transcribe`
     → `transcribeChunk` ([:249](../../backend/src/controllers/consultations.controller.ts#L249)) → `transcribeAudioBuffer` ([speech.service.ts:90](../../backend/src/services/speech.service.ts#L90)),
     que aplica o **filtro de alucinações** do Whisper.
- Fila de reinterpretação no cliente: [realtime-interpretation-queue.ts](../../frontend/src/components/consultation/dynamic/realtime-interpretation-queue.ts).

## 6. IA preenche o formulário (o coração)

> Detalhe completo em [04 — Pipeline de IA](04-pipeline-ia.md).

- `POST /:id/dynamic-reinterpret` → `reinterpretDynamicConsultation` ([:1953](../../backend/src/controllers/dynamic-consultations.controller.ts#L1953)).
- Orquestra: `runDynamicInterpretation` ([:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767)) —
  controla o **cursor** (`ConsultationAiState`), a **posse (lease)** e a janela de contexto.
- Extrai: `extractDynamicFormDelta` ([dynamic-clinical-ai.service.ts:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992)) —
  monta o prompt, aplica o schema, valida evidência, autoriza falante, monta quarentena.
- Persiste: `applyAiOutput` ([:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613)) —
  grava `ConsultationFieldValue` + histórico imutável `ConsultationFieldEvent`, ou envia para quarentena.
  **Nunca sobrescreve valor manual/confirmado.**

## 7. Edição manual (sempre vence a IA)

- `PATCH /:id/dynamic-fields` → `updateDynamicFields` ([:785](../../backend/src/controllers/dynamic-consultations.controller.ts#L785))
  → `applyManualChanges` ([:676](../../backend/src/controllers/dynamic-consultations.controller.ts#L676)).
- Usa **revisão otimista** (`expectedRevision`) para detectar edição concorrente.
- Autosave com debounce e fila serial: `useDynamicConsultation` no frontend.

## 8. Tópicos e ferramentas de apoio

- Tópicos da conversa: `GET /:id/topics` → `getDynamicConversationTopics` ([:1988](../../backend/src/controllers/dynamic-consultations.controller.ts#L1988))
  → `suggestDynamicConversationTopics` ([dynamic-clinical-ai.service.ts:1235](../../backend/src/services/dynamic-clinical-ai.service.ts#L1235)).
- Referência de medicamento (Anvisa): `POST /:id/medication-reference` → `getMedicationReference` ([:2493](../../backend/src/controllers/dynamic-consultations.controller.ts#L2493))
  → `findMedicationReference` ([medication-reference.service.ts:98](../../backend/src/services/medication-reference.service.ts#L98)).

## 9. Gerar a evolução (SOAP/DAP/BIRP)

- `POST /:id/generated-documents` → `generateDynamicDocument` ([:2030](../../backend/src/controllers/dynamic-consultations.controller.ts#L2030)):
  1. Diariza o áudio/transcrição → `diarizeAudio`/`diarizeTranscript` ([review.service.ts:340](../../backend/src/services/review.service.ts#L340)) — separa Médico/Paciente/Terceiro.
  2. Faz uma **revisão final** com voz identificada e autorizada (`runDynamicInterpretation` com `finalReview: true`).
  3. Gera o rascunho → `generateDynamicClinicalDocument` ([dynamic-clinical-ai.service.ts:1417](../../backend/src/services/dynamic-clinical-ai.service.ts#L1417)) —
     cada seção precisa de **citação literal**.
  4. Salva um `GeneratedClinicalDocument` (`status: rascunho`, `source: ia`).

## 10. Confirmar / finalizar / adendar

- `PATCH /:id/generated-documents/:docId/confirm` → `confirmDynamicDocument` ([:2263](../../backend/src/controllers/dynamic-consultations.controller.ts#L2263)):
  - bloqueia se houver quarentena crítica pendente (`assertDynamicFinalizationReady` [:104](../../backend/src/controllers/dynamic-consultations.controller.ts#L104));
  - confirmar o documento **compartilhável** finaliza a consulta (`em_consulta` → `finalizado`);
  - após finalizado, nova confirmação exige **motivo** e gera **adendo imutável** (novo documento com `parentDocumentId`).
- A proveniência validada pela IA não pode ser alterada na confirmação — só o texto clínico (`generatedEvidenceFingerprint` [:199](../../backend/src/controllers/dynamic-consultations.controller.ts#L199)).

## 11. Corrigir transcrição depois

- `POST /:id/versions` → `createDynamicTranscriptVersion` ([:2559](../../backend/src/controllers/dynamic-consultations.controller.ts#L2559)):
  cria `ConsultationVersion` (snapshot), **invalida valores exclusivamente da IA** (segmentId/tempos mudaram),
  preserva valores manuais e zera o cursor da IA.

## 12. Exportar

- `GET /:id/export/:kind` → `exportDynamicDocument` ([:2727](../../backend/src/controllers/dynamic-consultations.controller.ts#L2727)):
  exporta **um** documento por vez; o `compartilhavel` **nunca** inclui o `restrito`. Registra auditoria de acesso.

## Ordem de leitura sugerida

1. [page.tsx](../../frontend/src/app/consultations/[id]/page.tsx) →
   [DynamicConsultationView.tsx](../../frontend/src/components/consultation/dynamic/DynamicConsultationView.tsx) →
   [useDynamicConsultation.ts](../../frontend/src/hooks/useDynamicConsultation.ts)
2. [dynamic-consultation-api.ts](../../frontend/src/services/dynamic-consultation-api.ts) (quais endpoints cada ação chama)
3. [consultations.routes.ts](../../backend/src/routes/consultations.routes.ts) → `dynamic-consultations.controller.ts`
4. [dynamic-clinical-ai.service.ts](../../backend/src/services/dynamic-clinical-ai.service.ts) (o pipeline)
5. [schema.prisma](../../backend/prisma/schema.prisma) (onde tudo é persistido)

## Próximo

→ [03 — Backend: rotas e controllers](03-backend-rotas-controllers.md)
