# 08 — Frontend

[← Voltar ao índice](README.md)

Next.js 15 (App Router) + React 19 + TanStack Query + Tailwind. Alias `@/` → `src/`.
As páginas são **finas**: carregam dados com React Query e delegam a componentes.

## Estrutura

```text
frontend/src/
├── app/            rotas (App Router) — páginas finas
├── components/     UI por domínio (consultation/dynamic, forms, agendas, patients, dashboard, ui…)
├── hooks/          estado e efeitos (consulta, transcrição)
├── services/       camada HTTP + sessão
├── types/          contratos (index.ts geral, forms.ts do motor dinâmico)
├── lib/            utilidades (form-layout)
└── middleware.ts   proteção de rotas no edge
```

## Rotas · [app/](../../frontend/src/app/)

| Rota | Arquivo | O que é |
|------|---------|---------|
| `/` | [app/page.tsx](../../frontend/src/app/page.tsx) | Dashboard |
| `/login`, `/cadastro` | [login/page.tsx](../../frontend/src/app/login/page.tsx), [cadastro/page.tsx](../../frontend/src/app/cadastro/page.tsx) | Autenticação (`AuthPage`) |
| `/patients` … | [patients/](../../frontend/src/app/patients/) | Lista, novo, edição, detalhe |
| `/consultations/[id]` | [consultations/[id]/page.tsx](../../frontend/src/app/consultations/[id]/page.tsx) | **Consulta em andamento** → `DynamicConsultationView` |
| `/agendas/[id]` | [agendas/[id]/page.tsx](../../frontend/src/app/agendas/[id]/page.tsx) | Calendário da agenda |
| `/formularios`, `/formularios/[id]` | [formularios/](../../frontend/src/app/formularios/) | Gerenciador e editor de formulários |
| `/settings` | [settings/page.tsx](../../frontend/src/app/settings/page.tsx) | Configurações (agendas, retenção) |

Proteção de rota: [middleware.ts:11](../../frontend/src/middleware.ts#L11) (redireciona sem sessão).

## Camada HTTP · [services/](../../frontend/src/services/)

| Arquivo | Export | Papel |
|---------|--------|-------|
| [api.ts](../../frontend/src/services/api.ts) | `api` [:123](../../frontend/src/services/api.ts#L123), `BASE` [:23](../../frontend/src/services/api.ts#L23), `ApiError` [:33](../../frontend/src/services/api.ts#L33) | **Único ponto de HTTP** (auth, pacientes, agenda). Inclui cookie, normaliza erros `{ error }` |
| [dynamic-consultation-api.ts](../../frontend/src/services/dynamic-consultation-api.ts) | `dynamicConsultationApi` [:70](../../frontend/src/services/dynamic-consultation-api.ts#L70) | Todas as chamadas da consulta dinâmica (ver tabela abaixo) |
| [forms-api.ts](../../frontend/src/services/forms-api.ts) | `formsApi` [:87](../../frontend/src/services/forms-api.ts#L87) | CRUD/publish de formulários |
| [agenda-form-options.ts](../../frontend/src/services/agenda-form-options.ts) | `listPublishedAgendaForms` [:28](../../frontend/src/services/agenda-form-options.ts#L28) | Formulários publicados para a agenda |
| [client-session.ts](../../frontend/src/services/client-session.ts) | `clearClinicalSessionStorage`, `notifySessionExpired`, `SESSION_EXPIRED_EVENT` | Sessão expirada e limpeza local |
| [schedule-slots.ts](../../frontend/src/services/schedule-slots.ts) | `isSelectedScheduleSlotAvailable` | Regra de slot no cliente |

### `dynamicConsultationApi` → endpoint ([dynamic-consultation-api.ts:70](../../frontend/src/services/dynamic-consultation-api.ts#L70))

| Método (frontend) | Endpoint | Controller |
|-------------------|----------|-----------|
| `runtime` | `GET /:id/runtime` | `getDynamicRuntime` |
| `updateFields` | `PATCH /:id/dynamic-fields` | `updateDynamicFields` |
| `previewFormVersion` / `changeFormVersion` | `POST /:id/form-version` | `changeDynamicFormVersion` |
| `addParticipant` / `updateParticipant` | `POST|PATCH /:id/participants` | `upsertDynamicParticipant` |
| `recordConsent` | `POST /:id/consents` | `recordDynamicConsent` |
| `reinterpret` | `POST /:id/dynamic-reinterpret` | `reinterpretDynamicConsultation` |
| `topics` | `GET /:id/topics` | `getDynamicConversationTopics` |
| `generateDocument` | `POST /:id/generated-documents` | `generateDynamicDocument` |
| `confirmDocument` | `PATCH /:id/generated-documents/:docId/confirm` | `confirmDynamicDocument` |
| `resolveQuarantine` | `PATCH /:id/quarantine/:itemId` | `resolveDynamicQuarantine` |
| `transcriptVersions` / `createTranscriptVersion` | `GET|POST /:id/versions` | `list/createDynamicTranscriptVersion` |
| `medicationReference` / `reviewMedicationReference` | `.../medication-reference` | `get/reviewMedicationReference` |
| `exportDocument` | `GET /:id/export/:kind` | `exportDynamicDocument` |

## Hooks · [hooks/](../../frontend/src/hooks/)

| Arquivo | Export | Papel |
|---------|--------|-------|
| [useDynamicConsultation.ts](../../frontend/src/hooks/useDynamicConsultation.ts) | `useDynamicConsultation` [:36](../../frontend/src/hooks/useDynamicConsultation.ts#L36) | **Estado da consulta**: carrega runtime, mantém valores locais por documento, faz **merge** do servidor com mudanças pendentes, **autosave** com debounce e **fila serial** por campo (revisão otimista) |
| [useRealtimeTranscription.ts](../../frontend/src/hooks/useRealtimeTranscription.ts) | `useRealtimeTranscription` [:39](../../frontend/src/hooks/useRealtimeTranscription.ts#L39) | Microfone, WebRTC Realtime, fallback local, callbacks de transcrição |
| [usePersistentState.ts](../../frontend/src/hooks/usePersistentState.ts) | `usePersistentState` [:5](../../frontend/src/hooks/usePersistentState.ts#L5) | Estado espelhado em `localStorage` |

## Componentes da consulta · [components/consultation/dynamic/](../../frontend/src/components/consultation/dynamic/)

| Componente | Papel |
|-----------|-------|
| [DynamicConsultationView.tsx](../../frontend/src/components/consultation/dynamic/DynamicConsultationView.tsx) | **Coordenador da tela**: abas, gravação, interpretação, geração/confirmação, ferramentas |
| [DynamicFieldRenderer.tsx](../../frontend/src/components/consultation/dynamic/DynamicFieldRenderer.tsx) | Renderiza cada tipo de campo a partir do manifesto |
| [DynamicReviewPanel.tsx](../../frontend/src/components/consultation/dynamic/DynamicReviewPanel.tsx) | Central de quarentena/revisão (sugestões, conflitos, riscos) |
| [DynamicEvolutionPanel.tsx](../../frontend/src/components/consultation/dynamic/DynamicEvolutionPanel.tsx) | Geração/edição/confirmação da evolução |
| [DynamicConversationPanel.tsx](../../frontend/src/components/consultation/dynamic/DynamicConversationPanel.tsx) / [DynamicConversationHistoryModal.tsx](../../frontend/src/components/consultation/dynamic/DynamicConversationHistoryModal.tsx) | Transcrição/diálogo e histórico |
| [DynamicMedicationPanel.tsx](../../frontend/src/components/consultation/dynamic/DynamicMedicationPanel.tsx) | Referência farmacológica |
| [DynamicPreparationPanel.tsx](../../frontend/src/components/consultation/dynamic/DynamicPreparationPanel.tsx) | Consentimentos/participantes antes de gravar |
| [ConsultationStartDialog.tsx](../../frontend/src/components/consultation/dynamic/ConsultationStartDialog.tsx) | Diálogo de início (conflitos de consulta ativa) |
| [dynamic-voice-readiness.ts](../../frontend/src/components/consultation/dynamic/dynamic-voice-readiness.ts) | Prontidão de voz/consentimento (lógica pura) |
| [realtime-interpretation-queue.ts](../../frontend/src/components/consultation/dynamic/realtime-interpretation-queue.ts) | Enfileira reinterpretações durante a fala |

## Outros domínios de UI

- **Formulários**: [forms/](../../frontend/src/components/forms/) — `FormTemplatesManager`, `FormTemplateEditor`, `FormFieldIcon`.
- **Agendas**: [agendas/](../../frontend/src/components/agendas/) — calendário, marcação rápida, operações.
- **Dashboard**: [dashboard/](../../frontend/src/components/dashboard/) — visão geral, calendário (`calendar-utils.ts`).
- **Pacientes**: [patients/](../../frontend/src/components/patients/).
- **Providers**: [SessionProvider.tsx](../../frontend/src/components/providers/SessionProvider.tsx) (`useSession`), [QueryProvider.tsx](../../frontend/src/components/providers/QueryProvider.tsx).
- **UI base**: [ui/](../../frontend/src/components/ui/) — `Button`, `AsyncState` (Loading/Empty/Error), `FeedbackProvider` (`useFeedback`).

## Tipos · [types/](../../frontend/src/types/)

- [index.ts](../../frontend/src/types/index.ts) — contrato geral (paciente, agenda, consulta legada, status pt-BR).
- [forms.ts](../../frontend/src/types/forms.ts) — **contrato do motor dinâmico**: `DynamicConsultationRuntime` [:352](../../frontend/src/types/forms.ts#L352),
  `DynamicFieldValue`, `DynamicParticipant`, `DynamicConsent`, `DynamicQuarantineItem`, `DynamicGeneratedDocument`, etc.
  Espelha o payload de `runtimePayload` do backend — mantenha os dois em sincronia.

## Convenções

- `NEXT_PUBLIC_API_URL` é **embutido no build**: mudou → refaça o build do frontend.
- Erros da API chegam como `{ error }` (pt-BR); `ApiError`/`FormsApiError` normalizam.
- Campos clínicos podem ser string simples **ou** JSON serializado — use `parseJson` de [components/shared/utils.ts:19](../../frontend/src/components/shared/utils.ts#L19).

## Próximo

→ [09 — Segurança, consentimento e retenção](09-seguranca-consentimento-retencao.md)
