# 01 — Visão geral e stack

[← Voltar ao índice](README.md)

## O que é

O **PEP IA** é um prontuário eletrônico do paciente assistido por IA (MVP experimental,
pt-BR, **não homologado para uso clínico real**). Durante a consulta o áudio é gravado e
transcrito; a IA extrai informação clínica **com evidência literal** e a coloca nos campos
de um **formulário dinâmico versionado por especialidade**. Ao final, gera um rascunho de
evolução (SOAP/DAP/BIRP) sempre sujeito a revisão profissional.

A IA é **sempre assistente**: nada entra no prontuário sem campo permitido, tipo válido,
falante autorizado e citação literal. O que não passa vai para **quarentena** (revisão humana).

## Stack

| Camada | Tecnologias | Porta |
|--------|-------------|-------|
| **Backend** | Fastify 5, Prisma 6 + SQLite, SDK OpenAI (Responses API), TypeScript/CommonJS, `tsx` (dev) / `tsc` (build) | **3000** |
| **Frontend** | Next.js 15 (App Router), React 19, TanStack Query, Tailwind 3, `lucide-react`, TypeScript/ESNext (alias `@/` → `src/`) | **3001** |
| **Monorepo** | npm workspaces (`backend`, `frontend`; raiz orquestra com `concurrently`) | — |

> ⚠️ O `README.md` da raiz inverte as portas. O correto é **backend 3000 / frontend 3001**
> (`server.ts` default `PORT=3000`; `frontend/package.json` usa `next dev -p 3001`).

## Diagrama de camadas

```text
Navegador (Next.js :3001)
   │  HTTP/JSON + cookie de sessão (pep_token)
   ▼
API Fastify (:3000)
   ├── onRequest: autentica JWT e injeta request.authUser        (app.ts)
   ├── routes/       — só path → handler
   ├── controllers/  — HTTP, valida dono, orquestra, persiste
   ├── services/     — IA (OpenAI), diarização, retenção, cripto, formulários
   └── lib/          — prisma, auth, agenda, consentimento, feriados
   ▼
Prisma → SQLite (backend/prisma/dev.db)
```

Caminho típico de uma requisição:

```text
rota → controller → service/lib → Prisma ou OpenAI → resposta HTTP { ... } | { error }
```

Regras de camada:
- **routes/** não contêm regra de negócio.
- **controllers/** traduzem HTTP, validam propriedade (`userId`), coordenam services, gravam.
- **services/** concentram integração e transformação (IA, diarização, cripto, retenção).
- **lib/** guardam utilitários e regras compartilhadas (agenda, auth, prisma).

## Dois mundos de consulta no código

O repositório contém **dois** conjuntos de arquivos de consulta:

1. **Dinâmico (atual)** — `dynamic-consultations.controller.ts`, `dynamic-clinical-ai.service.ts`,
   `clinical-forms.service.ts`, componentes em `frontend/src/components/consultation/dynamic/`.
   É o fluxo de produção.
2. **Legado (herança)** — colunas fixas em `Consultation` (`chiefComplaint`, `hda`, `subjective`…),
   e o `consultations.controller.ts` guarda apenas o que ainda é usado (start, transcrição,
   áudio, realtime-token). Os campos fixos permanecem no schema **só para não perder dados**;
   o runtime dinâmico não os lê nem grava (ver comentário em [schema.prisma:199](../../backend/prisma/schema.prisma#L199)).

Ao ler o código, **priorize os arquivos com prefixo `dynamic`** e o `clinical-forms.service.ts`.

## Status de consulta

`em_espera` → `em_consulta` → `finalizado` (também `cancelado` e `faltou`).
Normalização e constantes em [lib/schedule.ts:8](../../backend/src/lib/schedule.ts#L8)
(`CONSULTATION_STATUS`, `normalizeConsultationStatus`).

## Glossário

| Termo | Significado |
|-------|-------------|
| **Formulário / template** | Definição de campos por especialidade. Rascunho editável (`ClinicalFormTemplate`) + versões imutáveis (`ClinicalFormTemplateVersion`). |
| **Definição (definition)** | JSON canônico do formulário (abas, campos, documentos). Validado por Zod em `clinical-forms.service.ts`. |
| **Manifesto (runtime manifest)** | Projeção "achatada" da definição usada em runtime pela IA e pela renderização. |
| **Documento** | Cada formulário tem dois: `compartilhavel` e `restrito`. Exportados e retidos separadamente. |
| **Campo (field)** | Unidade do formulário. Tem `type`, `ai.mode` e `semanticRole`. |
| **Modo de IA** | `sem_acesso` / `preencher` / `resumir` / `sugerir_revisao` — o que a IA pode fazer com o campo. |
| **Papel semântico** | Rótulo clínico do campo (`risco_protecao`, `medicamentos`, `exame_fisico_sinais_vitais`…) que dispara regras de revisão. |
| **Segmento** | Trecho da transcrição com sequência, texto e (quando houver) falante/autorização. |
| **Evidência** | Citação **literal** de um segmento que sustenta um valor. Sem ela, nada entra. |
| **Quarentena** | Fila de itens que a IA produziu mas que exigem decisão humana. |
| **Participante** | Pessoa presente na consulta (`profissional`, `paciente`, `acompanhante`…), com voz e consentimento. |
| **Pin de versão** | A consulta fica presa à versão publicada do formulário; publicar outra não altera consultas existentes. |

## Próximo

→ [02 — Fluxo de uma consulta (ponta a ponta)](02-fluxo-de-uma-consulta.md)
