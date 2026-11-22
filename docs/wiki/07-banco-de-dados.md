# 07 — Banco de dados

[← Voltar ao índice](README.md)

Prisma 6 + SQLite. Schema: [backend/prisma/schema.prisma](../../backend/prisma/schema.prisma).
Acesso **sempre** via `getPrisma()` ([lib/prisma.ts:29](../../backend/src/lib/prisma.ts#L29)).
Após mexer no schema: `npm run db:push` **e** `npm run db:generate`.

> SQLite não tem tipos ricos: arrays/objetos clínicos são gravados como **string JSON**
> (`valueJson`, `evidenceJson`, `payloadJson`, `contentJson`, `snapshot`…). O conteúdo do documento
> **restrito** é criptografado em repouso (`protectSensitiveText`).

## Mapa de relacionamentos (essencial)

```text
User ─┬─ Patient ─── Consultation
      ├─ Schedule ── Consultation
      ├─ ClinicalFormTemplate ── ClinicalFormTemplateVersion ── Consultation (pin)
      ├─ ClinicalFormDefault
      └─ AudioRetentionPolicy

Consultation ─┬─ ConsultationDocument ── ConsultationFieldValue ── ConsultationFieldEvent
              ├─ ConsultationParticipant ── ConsultationConsent
              ├─ ConsultationParticipantEvent
              ├─ ConsultationQuarantineItem
              ├─ GeneratedClinicalDocument (SOAP/DAP/BIRP; adendos via parentDocumentId)
              ├─ ConsultationTranscriptSegment
              ├─ ConsultationAiState (1:1 — cursor da IA)
              ├─ ConsultationVersion (snapshots)
              ├─ ConsultationAppointmentEvent
              ├─ MedicationReferenceRecord
              └─ RetentionDeletionEvent
```

## Models por área

### Identidade e configuração

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `User` | [:10](../../backend/prisma/schema.prisma#L10) | Profissional, dono de todos os dados. `suppressFormChangeWarning`, relações |
| `SpecialtyProfile` | [:56](../../backend/prisma/schema.prisma#L56) | Especialidade canônica (`code` único), habilita o motor dinâmico |
| `Schedule` | [:29](../../backend/prisma/schema.prisma#L29) | Agenda: turnos (`shiftsJson`), dias, duração, template vinculado |
| `AudioRetentionPolicy` | [:454](../../backend/prisma/schema.prisma#L454) | Prazos de retenção por classe + `legalHold` |
| `ArchivedScheduleSettings` | [:131](../../backend/prisma/schema.prisma#L131) | Config antiga — **não lida pelo runtime**, só preserva dados |

### Formulários

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `ClinicalFormTemplate` | [:72](../../backend/prisma/schema.prisma#L72) | Rascunho editável (`draftDefinitionJson`, `status`, `origin`) |
| `ClinicalFormTemplateVersion` | [:96](../../backend/prisma/schema.prisma#L96) | **Snapshot imutável**: `definitionJson` + `runtimeManifestJson` + `checksum` |
| `ClinicalFormDefault` | [:113](../../backend/prisma/schema.prisma#L113) | Formulário padrão por especialidade/usuário |

### Paciente e consulta

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `Patient` | [:144](../../backend/prisma/schema.prisma#L144) | Cadastro do paciente |
| `Consultation` | [:179](../../backend/prisma/schema.prisma#L179) | Núcleo: status, pin de formulário (`formTemplateVersionId`), áudio, transcrição. **As colunas fixas de prontuário (`chiefComplaint`, `subjective`…) são herança e não são usadas pelo runtime dinâmico** — ver comentário em [:199](../../backend/prisma/schema.prisma#L199) |

### Formulário dinâmico em runtime

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `ConsultationDocument` | [:292](../../backend/prisma/schema.prisma#L292) | Instância do documento (`compartilhavel`/`restrito`) na consulta, com prazo de retenção |
| `ConsultationFieldValue` | [:313](../../backend/prisma/schema.prisma#L313) | **Onde os valores clínicos vivem.** `source` (`manual`/`ia`), `reviewStatus`, `evidenceJson`, `revision` (otimista) |
| `ConsultationFieldEvent` | [:335](../../backend/prisma/schema.prisma#L335) | **Histórico imutável** de toda alteração de campo (quem, o quê, antes/depois) |
| `ConsultationAiState` | [:552](../../backend/prisma/schema.prisma#L552) | Cursor da IA (1:1): `lastProcessedSequence`, lease, `finalReviewAt` |
| `ConsultationTranscriptSegment` | [:572](../../backend/prisma/schema.prisma#L572) | Cada trecho confirmado da transcrição, com `sequence` e `source` |

### Participantes e consentimento

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `ConsultationParticipant` | [:356](../../backend/prisma/schema.prisma#L356) | Pessoa presente: `role`, `speakerLabel` (voz), `authorized` |
| `ConsultationParticipantEvent` | [:378](../../backend/prisma/schema.prisma#L378) | Histórico imutável de cadastro/associação de voz/autorização |
| `ConsultationConsent` | [:394](../../backend/prisma/schema.prisma#L394) | Consentimento (imutável): `type`, `granted`, `termsVersion`, `revokedAt` |

### Saídas, revisão e apoio

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `ConsultationQuarantineItem` | [:412](../../backend/prisma/schema.prisma#L412) | Fila de revisão humana (sugestões, conflitos, alertas de risco) |
| `GeneratedClinicalDocument` | [:429](../../backend/prisma/schema.prisma#L429) | Evolução SOAP/DAP/BIRP; adendos por `parentDocumentId`; `status`, `source` |
| `MedicationReferenceRecord` | [:467](../../backend/prisma/schema.prisma#L467) | Consulta farmacológica registrada por consulta |
| `ConsultationVersion` | [:592](../../backend/prisma/schema.prisma#L592) | Snapshot versionado (correção de transcrição, troca de formulário) |
| `ConsultationAppointmentEvent` | [:534](../../backend/prisma/schema.prisma#L534) | Histórico de operações de agenda |

### Retenção e auditoria

| Model | Linha | Para que serve |
|-------|-------|----------------|
| `RetentionDeletionEvent` | [:487](../../backend/prisma/schema.prisma#L487) | Trilha imutável das exclusões do motor de retenção |
| `AccessAuditEvent` | [:505](../../backend/prisma/schema.prisma#L505) | Auditoria de leitura sensível (sem conteúdo clínico) |
| `PendingAudioDeletion` | [:519](../../backend/prisma/schema.prisma#L519) | Fila durável para apagar o arquivo de áudio fora da transação do banco |

## Invariantes importantes

- **Nunca apague dados ao salvar.** IA só grava campo preenchido; não zera valor existente.
- **IA não sobrescreve `manual`/`confirmado`** — vira quarentena `conflito`.
- **Toda alteração de campo gera `ConsultationFieldEvent`** (rastreabilidade/anti-adulteração).
- **Correção de transcrição cria `ConsultationVersion`** e invalida valores exclusivamente de IA.
- **Revisão otimista** via `revision` em `ConsultationFieldValue`/`ConsultationDocument`.

## Comandos

```bash
npm run db:push       # aplica o schema ao SQLite
npm run db:generate   # regenera o Prisma Client
npm run db:studio     # abre o Prisma Studio
```

## Próximo

→ [08 — Frontend](08-frontend.md)
