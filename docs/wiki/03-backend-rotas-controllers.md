# 03 — Backend: rotas e controllers

[← Voltar ao índice](README.md)

Tudo em `/api/*` é autenticado no `onRequest` de [app.ts:71](../../backend/src/app.ts#L71),
exceto `GET /health`, `POST /api/auth/login` e `POST /api/auth/register`
([app.ts:19](../../backend/src/app.ts#L19)). O hook valida o JWT do cookie `pep_token`,
consulta o usuário e injeta `request.authUser`. Prefixos registrados em [app.ts:108](../../backend/src/app.ts#L108).

## Bootstrap

| Arquivo | Papel |
|---------|-------|
| [server.ts](../../backend/src/server.ts) | `buildServer()`, lê `PORT`, `listen` em `0.0.0.0`. Carrega `.env` da raiz e `backend/.env` por cima. |
| [app.ts](../../backend/src/app.ts) | Monta o Fastify: CORS, multipart (100 MB), parser JSON tolerante a corpo vazio, auth global, error handler, registro de rotas. |
| [types/fastify.d.ts](../../backend/src/types/fastify.d.ts) | Estende `FastifyRequest` com `authUser`. |

> **Corpo vazio em POST:** o parser em [app.ts:39](../../backend/src/app.ts#L39) aceita `{}` quando
> não há body — não quebre esse contrato (`/finalize`, `/reinterpret` etc.).

---

## Auth — `/api/auth` · [auth.routes.ts](../../backend/src/routes/auth.routes.ts)

| Método | Rota | Controller |
|--------|------|-----------|
| POST | `/register` | `registerUser` ([auth.controller.ts:61](../../backend/src/controllers/auth.controller.ts#L61)) — cria usuário, semeia especialidades e formulários-base |
| POST | `/login` | `loginUser` ([:123](../../backend/src/controllers/auth.controller.ts#L123)) |
| GET | `/me` | `getCurrentUser` ([:155](../../backend/src/controllers/auth.controller.ts#L155)) |
| POST | `/logout` | `logoutUser` ([:163](../../backend/src/controllers/auth.controller.ts#L163)) |

Hash/JWT/cookie em [lib/auth.ts](../../backend/src/lib/auth.ts) — ver [09 — Segurança](09-seguranca-consentimento-retencao.md).

---

## Consultations — `/api/consultations` · [consultations.routes.ts](../../backend/src/routes/consultations.routes.ts)

As rotas misturam **dois controllers**: o legado `consultations.controller.ts` (ciclo de vida
de gravação/áudio) e o atual `dynamic-consultations.controller.ts` (formulário, IA, documentos).

### Ciclo de gravação · [consultations.controller.ts](../../backend/src/controllers/consultations.controller.ts)

| Método | Rota | Controller | Função |
|--------|------|-----------|--------|
| GET | `/:id` | `getConsultation` ([:235](../../backend/src/controllers/consultations.controller.ts#L235)) | Dados básicos da consulta |
| POST | `/:id/start` | `startConsultation` ([:135](../../backend/src/controllers/consultations.controller.ts#L135)) | `em_espera` → `em_consulta` |
| POST | `/:id/transcribe` | `transcribeChunk` ([:249](../../backend/src/controllers/consultations.controller.ts#L249)) | Whisper (fallback local) |
| POST | `/:id/realtime-token` | `createRealtimeToken` ([:285](../../backend/src/controllers/consultations.controller.ts#L285)) | Segredo efêmero do Realtime |
| POST | `/:id/realtime-transcript` | `appendRealtimeTranscript` ([:307](../../backend/src/controllers/consultations.controller.ts#L307)) | Persiste segmento confirmado |
| POST | `/:id/audio` | `saveAudio` ([:349](../../backend/src/controllers/consultations.controller.ts#L349)) | Salva o áudio (cripto em repouso) |
| GET | `/:id/audio-file` | `streamAudio` ([:440](../../backend/src/controllers/consultations.controller.ts#L440)) | Reprodução para auditoria |

### Formulário dinâmico, IA e documentos · [dynamic-consultations.controller.ts](../../backend/src/controllers/dynamic-consultations.controller.ts)

| Método | Rota | Controller | Função |
|--------|------|-----------|--------|
| GET | `/:id/runtime` | `getDynamicRuntime` ([:636](../../backend/src/controllers/dynamic-consultations.controller.ts#L636)) | Monta todo o estado do runtime |
| PATCH | `/:id/dynamic-fields` | `updateDynamicFields` ([:785](../../backend/src/controllers/dynamic-consultations.controller.ts#L785)) | Edição manual (revisão otimista) |
| POST | `/:id/form-version` | `changeDynamicFormVersion` ([:840](../../backend/src/controllers/dynamic-consultations.controller.ts#L840)) | Troca/preview de versão antes de iniciar |
| POST/PATCH | `/:id/participants[/:participantId]` | `upsertDynamicParticipant` ([:1120](../../backend/src/controllers/dynamic-consultations.controller.ts#L1120)) | Cadastra/edita participante e voz |
| POST | `/:id/consents` | `recordDynamicConsent` ([:1259](../../backend/src/controllers/dynamic-consultations.controller.ts#L1259)) | Registra consentimento (imutável) |
| POST | `/:id/dynamic-reinterpret` | `reinterpretDynamicConsultation` ([:1953](../../backend/src/controllers/dynamic-consultations.controller.ts#L1953)) | **IA preenche o formulário** |
| GET | `/:id/topics` | `getDynamicConversationTopics` ([:1988](../../backend/src/controllers/dynamic-consultations.controller.ts#L1988)) | Tópicos com evidência |
| POST | `/:id/generated-documents` | `generateDynamicDocument` ([:2030](../../backend/src/controllers/dynamic-consultations.controller.ts#L2030)) | Gera rascunho SOAP/DAP/BIRP |
| PATCH | `/:id/generated-documents/:docId/confirm` | `confirmDynamicDocument` ([:2263](../../backend/src/controllers/dynamic-consultations.controller.ts#L2263)) | Confirma/finaliza/adenda |
| PATCH | `/:id/quarantine/:itemId` | `resolveDynamicQuarantine` ([:2443](../../backend/src/controllers/dynamic-consultations.controller.ts#L2443)) | Descarta ou restaura item |
| POST | `/:id/versions` | `createDynamicTranscriptVersion` ([:2559](../../backend/src/controllers/dynamic-consultations.controller.ts#L2559)) | Corrige transcrição (nova versão) |
| GET | `/:id/versions` | `listDynamicTranscriptVersions` ([:2704](../../backend/src/controllers/dynamic-consultations.controller.ts#L2704)) | Histórico de versões |
| POST | `/:id/medication-reference` | `getMedicationReference` ([:2493](../../backend/src/controllers/dynamic-consultations.controller.ts#L2493)) | Consulta bula/Anvisa |
| PATCH | `/:id/medication-reference/:refId` | `reviewMedicationReference` ([:2527](../../backend/src/controllers/dynamic-consultations.controller.ts#L2527)) | Aceita/descarta referência |
| GET | `/:id/export/:kind` | `exportDynamicDocument` ([:2727](../../backend/src/controllers/dynamic-consultations.controller.ts#L2727)) | Exporta 1 documento |

**Funções internas-chave** deste controller (não são rotas, mas fazem o trabalho pesado):

| Função | Linha | Papel |
|--------|-------|-------|
| `findOwnedConsultation` | [:275](../../backend/src/controllers/dynamic-consultations.controller.ts#L275) | Carrega a consulta do dono com todos os `include` |
| `runtimePayload` | [:499](../../backend/src/controllers/dynamic-consultations.controller.ts#L499) | Serializa o estado (descriptografa restrito, monta histórico de campo) |
| `runDynamicInterpretation` | [:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767) | Orquestra a IA: cursor, lease, contexto, persistência |
| `applyAiOutput` | [:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613) | Grava updates da IA ou manda para quarentena |
| `applyManualChanges` | [:676](../../backend/src/controllers/dynamic-consultations.controller.ts#L676) | Grava edição manual + evento imutável |
| `invalidateAiDerivedContent` | [:1048](../../backend/src/controllers/dynamic-consultations.controller.ts#L1048) | Invalida IA após revogar consentimento / remapear voz |
| `transcriptSegmentsFromStored` | [:1399](../../backend/src/controllers/dynamic-consultations.controller.ts#L1399) | Segmentos ao vivo (antes da diarização) |
| `transcriptSegmentsFromTurns` | [:1510](../../backend/src/controllers/dynamic-consultations.controller.ts#L1510) | Segmentos após diarização (com autorização por voz) |
| `ensureDynamicDocuments` | [:329](../../backend/src/controllers/dynamic-consultations.controller.ts#L329) | Cria os dois documentos com prazo de retenção |
| `ensureCoreParticipants` | [:366](../../backend/src/controllers/dynamic-consultations.controller.ts#L366) | Garante profissional + paciente |
| `assertDynamicRecordingConsent` | [:1371](../../backend/src/controllers/dynamic-consultations.controller.ts#L1371) | Bloqueia gravação sem consentimento |
| `assertDynamicFinalizationReady` | [:104](../../backend/src/controllers/dynamic-consultations.controller.ts#L104) | Bloqueia confirmação com quarentena crítica |

---

## Form templates — `/api/form-templates` · [form-templates.routes.ts](../../backend/src/routes/form-templates.routes.ts)

| Método | Rota | Controller |
|--------|------|-----------|
| GET | `/` | `listFormTemplates` ([form-templates.controller.ts:59](../../backend/src/controllers/form-templates.controller.ts#L59)) |
| POST | `/` | `createFormTemplate` ([:78](../../backend/src/controllers/form-templates.controller.ts#L78)) |
| GET | `/:id` | `getFormTemplate` ([:107](../../backend/src/controllers/form-templates.controller.ts#L107)) |
| PATCH | `/:id` | `updateFormTemplate` ([:116](../../backend/src/controllers/form-templates.controller.ts#L116)) |
| POST | `/:id/publish` | `publishFormTemplate` ([:164](../../backend/src/controllers/form-templates.controller.ts#L164)) |
| POST | `/:id/copy` | `copyFormTemplate` ([:183](../../backend/src/controllers/form-templates.controller.ts#L183)) |
| POST | `/:id/default` | `setDefaultFormTemplate` ([:198](../../backend/src/controllers/form-templates.controller.ts#L198)) |
| POST / DELETE | `/:id/archive` · `/:id` | `archiveFormTemplate` ([:213](../../backend/src/controllers/form-templates.controller.ts#L213)) |
| GET | `/:id/versions` | `listFormTemplateVersions` ([:228](../../backend/src/controllers/form-templates.controller.ts#L228)) |

Regra de negócio no service `form-templates.service.ts` — ver [05 — Motor de formulários](05-motor-formularios.md).

---

## Schedule — `/api/schedule` · [schedule.routes.ts](../../backend/src/routes/schedule.routes.ts)

| Método | Rota | Controller |
|--------|------|-----------|
| GET | `/dashboard` | `getDashboard` ([schedule.controller.ts:421](../../backend/src/controllers/schedule.controller.ts#L421)) |
| GET/POST | `/agendas` | `listSchedules` ([:334](../../backend/src/controllers/schedule.controller.ts#L334)) · `createSchedule` ([:345](../../backend/src/controllers/schedule.controller.ts#L345)) |
| GET/PUT | `/agendas/:agendaId` | `getSchedule` ([:377](../../backend/src/controllers/schedule.controller.ts#L377)) · `updateSchedule` ([:386](../../backend/src/controllers/schedule.controller.ts#L386)) |
| GET | `/agendas/:agendaId/calendar` | `getCalendar` ([:537](../../backend/src/controllers/schedule.controller.ts#L537)) |
| GET | `/agendas/:agendaId/slots` | `getAvailableSlots` ([:589](../../backend/src/controllers/schedule.controller.ts#L589)) |
| POST | `/agendas/:agendaId/quick-book` | `quickBookAppointment` ([:651](../../backend/src/controllers/schedule.controller.ts#L651)) |
| PATCH | `/appointments/:consultationId` | `updateAppointment` ([:820](../../backend/src/controllers/schedule.controller.ts#L820)) — remarcar/cancelar/faltou |

Regras de horário, disponibilidade e slots centralizadas em [lib/schedule.ts](../../backend/src/lib/schedule.ts);
feriados em [lib/holidays.ts](../../backend/src/lib/holidays.ts).

---

## Patients — `/api/patients` · [patients.routes.ts](../../backend/src/routes/patients.routes.ts)

| Método | Rota | Controller |
|--------|------|-----------|
| GET | `/` | `listPatients` ([patients.controller.ts:104](../../backend/src/controllers/patients.controller.ts#L104)) — cursor |
| GET | `/duplicates` | `findPatientDuplicates` ([:172](../../backend/src/controllers/patients.controller.ts#L172)) |
| GET | `/:id` | `getPatient` ([:268](../../backend/src/controllers/patients.controller.ts#L268)) |
| POST | `/` | `createPatient` ([:277](../../backend/src/controllers/patients.controller.ts#L277)) |
| PUT | `/:id` | `updatePatient` ([:312](../../backend/src/controllers/patients.controller.ts#L312)) |
| DELETE | `/:id` | `deletePatient` ([:337](../../backend/src/controllers/patients.controller.ts#L337)) |
| GET | `/:id/summary` | `getPatientSummary` ([:374](../../backend/src/controllers/patients.controller.ts#L374)) — resumo longitudinal por IA |

---

## Retention — `/api/settings/retention` · [retention.routes.ts](../../backend/src/routes/retention.routes.ts)

| Método | Rota | Controller |
|--------|------|-----------|
| GET | `/` | `getRetentionPolicy` ([retention.controller.ts:25](../../backend/src/controllers/retention.controller.ts#L25)) |
| PATCH | `/` | `updateRetentionPolicy` ([:37](../../backend/src/controllers/retention.controller.ts#L37)) |

O motor de retenção em si roda em background — ver [09 — Segurança e retenção](09-seguranca-consentimento-retencao.md).

## Próximo

→ [04 — Pipeline de IA](04-pipeline-ia.md)
