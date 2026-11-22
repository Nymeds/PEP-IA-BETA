# 09 — Segurança, consentimento e retenção

[← Voltar ao índice](README.md)

O que torna este MVP incomum: governança de dados de ponta a ponta. Esta página reúne
autenticação, consentimento, autorização de voz, criptografia, retenção e auditoria.

## Autenticação e sessão

- **Cookie `pep_token`** (JWT) — assinado/verificado em [lib/auth.ts](../../backend/src/lib/auth.ts)
  (`signJwt`/`verifyJwt`, `AUTH_COOKIE_NAME` [:8](../../backend/src/lib/auth.ts#L8)).
- **Senha** com `scrypt` (`hashPassword`/`verifyPassword`).
- **Guarda global** no `onRequest` de [app.ts:71](../../backend/src/app.ts#L71): valida o token,
  consulta o usuário no banco e injeta `request.authUser`. Rotas públicas só as de [app.ts:19](../../backend/src/app.ts#L19).
- **Isolamento por dono**: controllers filtram por `userId` (ex.: `findOwnedConsultation`
  [dynamic-consultations.controller.ts:275](../../backend/src/controllers/dynamic-consultations.controller.ts#L275)).
- **Frontend**: [middleware.ts](../../frontend/src/middleware.ts) protege rotas; `SessionProvider` expõe `useSession`.

## Consentimento

Modelo em `ConsultationConsent` ([schema.prisma:394](../../backend/prisma/schema.prisma#L394)). Três tipos:
`gravacao_audio`, `transcricao_ia`, `participacao`. Registrado por
`recordDynamicConsent` ([:1259](../../backend/src/controllers/dynamic-consultations.controller.ts#L1259)) — **imutável** (nova linha por decisão, com `termsVersion`).

Regras:
- **Gravar exige consentimento** — `assertDynamicRecordingConsent` ([:1371](../../backend/src/controllers/dynamic-consultations.controller.ts#L1371))
  barra o início sem `gravacao_audio` + `transcricao_ia` e sem participantes autorizados.
- **Linha do tempo** — um segmento só é autorizado se o consentimento estava vigente **quando a fala ocorreu**:
  `consentWasGrantedAt` ([dynamic-consent-timeline.ts:43](../../backend/src/lib/dynamic-consent-timeline.ts#L43)) +
  `estimateDialogueTurnOccurredAt` ([:89](../../backend/src/lib/dynamic-consent-timeline.ts#L89)).
- **Revogar invalida a IA** — `invalidateAiDerivedContent` ([:1048](../../backend/src/controllers/dynamic-consultations.controller.ts#L1048))
  remove valores de IA, zera o cursor, invalida rascunhos e abre item de quarentena `consentimento_revogado`.

## Autorização de voz (quem sustenta o quê)

O ponto mais sutil. Consentir em **processar** uma voz ≠ dar a ela **papel semântico**.
Três portões em [dynamic-clinical-ai.service.ts](../../backend/src/services/dynamic-clinical-ai.service.ts):

- `canUseSegmentForAutomaticFormFill` [:631](../../backend/src/services/dynamic-clinical-ai.service.ts#L631) — **preenche automático** (só profissional/paciente identificados);
- `canUseSegmentForMandatoryReviewSuggestion` [:646](../../backend/src/services/dynamic-clinical-ai.service.ts#L646) — **sugestão com revisão obrigatória** (acompanhante, relação contextual, voz ambígua consentida);
- `canUseSegmentForFinalDocumentDraft` [:663](../../backend/src/services/dynamic-clinical-ai.service.ts#L663) — entra na **evolução** (atribuído).

Remapear voz de participante também invalida a IA anterior (`invalidateAiAfterSpeakerRemap` [:1032](../../backend/src/controllers/dynamic-consultations.controller.ts#L1032)).
Ver [04 — Pipeline de IA](04-pipeline-ia.md) para o detalhe das barreiras.

## Criptografia em repouso

- [sensitive-data.service.ts](../../backend/src/services/sensitive-data.service.ts):
  `protectSensitiveText` [:28](../../backend/src/services/sensitive-data.service.ts#L28) / `revealSensitiveText` [:44](../../backend/src/services/sensitive-data.service.ts#L44) para texto **restrito**;
  `protectAudioBuffer` [:60](../../backend/src/services/sensitive-data.service.ts#L60) / `revealAudioBuffer` [:75](../../backend/src/services/sensitive-data.service.ts#L75) para áudio.
- Chave: **`DATA_ENCRYPTION_KEY`** (32 bytes) — obrigatória em produção. `hasSensitiveDataEncryption` [:24](../../backend/src/services/sensitive-data.service.ts#L24).
- No controller, o conteúdo do documento **restrito** é sempre protegido ao gravar e revelado ao ler
  (`protectJson`/`unprotectJson` [:243](../../backend/src/controllers/dynamic-consultations.controller.ts#L243)).

> Separação **compartilhável × restrito**: a exportação do compartilhável nunca inclui o restrito;
> conteúdo restrito é cifrado em repouso e sua leitura é auditada.

## Retenção

- Políticas por usuário em `AudioRetentionPolicy` ([schema.prisma:454](../../backend/prisma/schema.prisma#L454)):
  `audioRetentionDays`, `sharedRecordRetentionYears`, `restrictedRecordRetentionYears`, `legalHold`.
  Editadas via `/api/settings/retention` ([retention.controller.ts](../../backend/src/controllers/retention.controller.ts)).
- Prazos aplicados na criação dos documentos: `ensureDynamicDocuments` ([:329](../../backend/src/controllers/dynamic-consultations.controller.ts#L329)).
- **Motor de retenção** ([retention.service.ts](../../backend/src/services/retention.service.ts)):
  `runRetentionCycle` [:497](../../backend/src/services/retention.service.ts#L497) anonimiza/expira; `startRetentionWorker` [:582](../../backend/src/services/retention.service.ts#L582) roda em background;
  áudio é apagado por fila durável (`PendingAudioDeletion`) via `enqueuePendingAudioDeletion` [:125](../../backend/src/services/retention.service.ts#L125) /
  `processPendingAudioDeletions` [:152](../../backend/src/services/retention.service.ts#L152). Snapshots são redigidos por `redactConsultationVersionSnapshot` [:74](../../backend/src/services/retention.service.ts#L74).
- Toda exclusão vira `RetentionDeletionEvent` (trilha imutável). Documento excluído **não** pode ser recriado
  (`assertDocumentAvailable` / `RetentionExpiredError` no controller).

## Auditoria de acesso

- `recordSensitiveAccess` ([access-audit.service.ts:3](../../backend/src/services/access-audit.service.ts#L3)) grava `AccessAuditEvent`
  **sem conteúdo clínico** (só ator, classe de dado, ação, requestId). Ex.: `getDynamicRuntime` e `exportDynamicDocument` auditam leitura.

## Anti-injeção de prompt

- Definição de formulário é **sanitizada** (`sanitizeUnknown` [clinical-forms.service.ts:652](../../backend/src/services/clinical-forms.service.ts#L652)) — remove control chars e cercas markdown.
- O prompt declara explicitamente que **manifesto e transcrição são dados não confiáveis**
  (`DYNAMIC_AI_INSTRUCTIONS` [dynamic-clinical-ai.service.ts:214](../../backend/src/services/dynamic-clinical-ai.service.ts#L214)).

## Rastreabilidade (nunca sobrescrever)

- `ConsultationFieldEvent`, `ConsultationParticipantEvent`, `ConsultationConsent`, `ConsultationVersion`,
  `GeneratedClinicalDocument` (adendos) — todos **append-only**.
- Correção de documento confirmado → **adendo** com `parentDocumentId` e `amendmentReason`.

## Checklist ao mexer aqui

- Novo campo sensível? Decida documento (`restrito`?) e passe por `protectJson`/`unprotectJson`.
- Nova leitura sensível? Chame `recordSensitiveAccess`.
- Nova origem de dado da IA? Reavalie os três portões de voz antes de habilitar preenchimento.

## Próximo

→ [10 — Mapa de funções](10-mapa-de-funcoes.md)
