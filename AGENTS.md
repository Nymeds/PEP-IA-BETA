# AGENTS.md — PEP IA

Guia para agentes de IA que trabalham neste repositório. Leia antes de fazer alterações.

## O que é

Prontuário Eletrônico do Paciente (PEP) com IA. Durante a consulta, o áudio é
gravado em pedaços, transcrito (OpenAI Whisper) e a IA (GPT) extrai os dados
clínicos e preenche os campos do prontuário em tempo real. Ao encerrar, gera a
evolução clínica no formato **SOAP**.

> MVP experimental, em **português do Brasil**. Sem autenticação, **não homologado
> para uso clínico real**. Todo o código, comentários e mensagens são em pt-BR —
> mantenha esse padrão.

## Stack

- **Monorepo** com npm workspaces: `backend` e `frontend` (raiz orquestra).
- **Backend** — Fastify 5, Prisma 6 + SQLite, OpenAI SDK v4. TypeScript (CommonJS),
  roda com `tsx` em dev e compila com `tsc`.
- **Frontend** — Next.js 15 (App Router), React 19, TanStack Query, react-hook-form
  + zod, Tailwind CSS 3, ícones `lucide-react`. TypeScript (ESNext), alias `@/` → `src/`.
- **Node 18+**. Não há framework de testes nem ESLint no backend (`next lint` só no front).

## Comandos

Sempre rode da **raiz** do repositório, salvo indicação.

```bash
npm install                 # instala os dois workspaces
npm run db:push             # cria/atualiza o SQLite (backend/prisma/dev.db)
npm run db:generate         # regenera o Prisma Client (após mexer no schema)
npm run db:studio           # abre o Prisma Studio

npm run dev                 # sobe backend + frontend juntos (concurrently)
npm run dev:backend         # só o backend  (tsx watch, porta 3000)
npm run dev:frontend        # só o frontend (next dev,  porta 3001)
```

Dentro de `backend/`: `npm run build` (tsc → `dist/`), `npm start` (node dist).
Dentro de `frontend/`: `npm run build`, `npm start`, `npm run lint`.

Antes de considerar uma mudança "pronta": rode `npm run build` no workspace
afetado (não há testes para validar). No frontend, rode também `npm run lint`.

## Portas (⚠ o README está desatualizado)

A configuração **real** do código é:

| Serviço  | Porta | Onde está definido |
|----------|-------|--------------------|
| Backend  | 3000  | `PORT` no `.env` (default 3000 em `server.ts`) |
| Frontend | 3001  | `next dev -p 3001` em `frontend/package.json` |

O `README.md` diz backend 3001 / frontend 3000 — **ignore**, está invertido em
relação ao código. Acesse o app em **http://localhost:3001**.

## Arquitetura

### Backend (`backend/src/`)
Camadas: `routes/` → `controllers/` → `services/` → `lib/`.

- `server.ts` — bootstrap do Fastify, CORS, multipart, dotenv, registro das rotas.
- `routes/*.routes.ts` — só mapeiam path → handler do controller.
- `controllers/*.controller.ts` — lógica HTTP + acesso ao banco via `getPrisma()`.
- `services/` — toda a integração com a OpenAI:
  - `speech.service.ts` — transcrição (Whisper) + **filtro de alucinações** do Whisper.
  - `extraction.service.ts` — relê a transcrição inteira e devolve `ExtractedData` consolidado.
  - `review.service.ts` — diarização (separa Médico/Paciente) + extração apurada na revisão final.
  - `soap.service.ts` — gera o SOAP.
  - `analysis.service.ts` — tópicos da conversa e resumo do paciente.
- `lib/prisma.ts` — singleton lazy do Prisma Client.

### Frontend (`frontend/src/`)
App Router em `app/`; UI em `components/` (com `consultation/tabs/` por aba do PEP);
estado em `hooks/`; chamadas HTTP centralizadas em `services/api.ts`; tipos em
`types/index.ts`.

- `hooks/useAudioRecorder.ts` — grava em segmentos (`chunkIntervalMs`, default 5s) via MediaRecorder.
- `hooks/useConsultation.ts` — estado da consulta, merge do `ExtractedData` nas abas,
  status das abas (`idle`/`writing`/`incomplete`/`complete`) e **autosave com debounce de 1,5s**.

### Pipeline de IA (o coração do sistema)
1. **Gravação** em chunks (~5s) no navegador.
2. **`/transcribe`** — transcreve o chunk, descarta alucinações, **acumula** no
   `transcript`. Rápido e barato; **não** faz extração clínica aqui.
3. **`/reinterpret`** (periódico) — relê o `transcript` COMPLETO e devolve o estado
   consolidado de todos os campos (não-incremental). O front faz merge nas abas.
4. **`/finalize`** — diarização → re-extração sobre o diálogo estruturado → SOAP →
   marca a consulta como `completed`.
5. **Versionamento** — toda edição da transcrição cria uma **nova** `ConsultationVersion`
   (snapshot do estado anterior), nunca sobrescreve (rastreabilidade/anti-adulteração).

Status da consulta: `scheduled` → `active` → `completed`.

## Convenções importantes

- **Campos clínicos = strings JSON.** No SQLite, arrays/objetos (sintomas, medicações,
  sinais vitais, revisão de sistemas, etc.) são guardados como **string JSON**. O
  back serializa em `serializeExtractedToDb`; o front faz `JSON.parse` ao exibir.
- **Nunca apague dados ao salvar.** `serializeExtractedToDb` e o `mergeExtracted`
  só gravam campos que vieram preenchidos — extração nova nunca zera campo existente.
- **Acesse o banco sempre via `getPrisma()`** (nunca instancie `new PrismaClient`).
- **Clientes OpenAI são lazy** (`getOpenAI()` por serviço) — siga o mesmo padrão.
- **Respostas de IA são JSON.** Os services pedem JSON, limpam cercas ```` ```json ````
  e fazem parse com fallback seguro (retornam `{}`/default em erro). Mantenha isso.
- Requests Fastify são tipados via generics (`FastifyRequest<{ Params: ... }>`).
- Mensagens de erro voltam como `{ error: '...' }` em pt-BR.

## Banco de dados

- Prisma + SQLite. Schema em `backend/prisma/schema.prisma`; models `Patient`,
  `Consultation`, `ConsultationVersion`.
- Após mexer no schema: `npm run db:push` **e** `npm run db:generate`.
- **`lib/prisma.ts` resolve `DATABASE_URL`** em `resolveDatabaseUrl()`: caminhos `file:`
  relativos são ancorados em `backend/prisma/` (não no CWD), então o runtime e o
  `prisma db push` apontam sempre para o mesmo arquivo, independente de onde o backend
  foi iniciado. Sem `DATABASE_URL`, usa `backend/prisma/dev.db`.

## Variáveis de ambiente

`.env` na **raiz** (veja `.env.EXAMPLE`). `server.ts` carrega a raiz e depois
`backend/.env` por cima (override).

| Variável | Obrigatória | Observação |
|----------|-------------|------------|
| `OPENAI_API_KEY` | **Sim** | Sem ela, transcrição/extração/SOAP falham. |
| `OPENAI_TRANSCRIPTION_MODEL` | não | default `whisper-1`. |
| `OPENAI_EXTRACTION_MODEL` | não | usado em extração e diarização. |
| `OPENAI_SOAP_MODEL` | não | geração do SOAP. |
| `PORT` | não | backend, default 3000. |
| `FRONTEND_URL` | não | CORS. |
| `DATABASE_URL` | não | banco SQLite; `file:` relativo resolve em `backend/prisma/`. |
| `NEXT_PUBLIC_API_URL` | não | URL do backend usada pelo front (default `http://localhost:3000`). |

## Armadilhas conhecidas

- **`frontend/src/services/api.ts`** define `BASE` a partir de `NEXT_PUBLIC_API_URL`
  (fallback `http://localhost:3000`). Lembre que vars `NEXT_PUBLIC_*` são embutidas no
  **build** do Next — mudou o valor, refaça o build do frontend.
- ⚠ **Filtro de alucinação só funciona 100% com `whisper-1`.** O filtro por confiança
  (`verbose_json`) depende de `model.includes('whisper')`; com outros modelos só sobra
  a blocklist de frases.
- POSTs sem corpo (`/finalize`, `/reinterpret`) são tratados: o `api.ts` só manda
  `Content-Type: application/json` quando há body, e o `server.ts` aceita JSON vazio.
  Não quebre esse contrato.
- Áudios ficam em `backend/uploads/audio/` (no `.gitignore`); são mantidos para auditoria.
