# Guia de arquitetura — PEP IA

Este documento explica o projeto em dois níveis: o técnico (como o código funciona) e o informal (qual é a ideia por trás dele). O sistema é um MVP de prontuário eletrônico que grava uma consulta, transforma áudio em texto, extrai informações clínicas e gera uma evolução SOAP.

## 1. Visão rápida

```text
Navegador (Next.js :3001)
        │ HTTP/JSON + cookie de sessão
        ▼
API Fastify (:3000)
        │
        ├── Controllers: recebem requisições e coordenam o caso de uso
        ├── Services: OpenAI, áudio, extração, revisão e SOAP
        ├── Lib: Prisma, autenticação, agenda e utilidades
        ▼
Prisma ── SQLite (backend/prisma/dev.db)
```

Em linguagem simples: o frontend é a tela e o estado da interface; o backend é o cérebro operacional; o banco guarda o prontuário; os services são os adaptadores que conversam com a OpenAI.

## 2. Como navegar rapidamente

| Quero entender... | Comece por... |
|---|---|
| Como o servidor sobe | `backend/src/server.ts` → `backend/src/app.ts` |
| Quais endpoints existem | `backend/src/routes/*.routes.ts` |
| O que um endpoint realmente faz | controller correspondente em `backend/src/controllers/` |
| Banco e campos da consulta | `backend/prisma/schema.prisma` |
| Gravação e transcrição | `frontend/src/hooks/useRealtimeTranscription.ts` e `backend/src/services/speech.service.ts` |
| Estado da tela da consulta | `frontend/src/components/consultation/ConsultationView.tsx` e `frontend/src/hooks/useConsultation.ts` |
| Chamadas HTTP do frontend | `frontend/src/services/api.ts` |
| Extração clínica com IA | `backend/src/services/extraction.service.ts` |
| Revisão final e diarização | `backend/src/services/review.service.ts` |
| SOAP | `backend/src/services/soap.service.ts` |
| Agendamento | `backend/src/controllers/schedule.controller.ts` e `backend/src/lib/schedule.ts` |

Atalho de busca: `rg -n "nomeDaFuncao|/api/consultations|fieldName" backend/src frontend/src`.

## 3. Inicialização e infraestrutura

### Raiz

- `package.json`: workspace npm, comandos para subir backend/frontend juntos e comandos do Prisma.
- `.env.EXAMPLE`: modelo das variáveis. `OPENAI_API_KEY` é essencial.
- `AGENTS.md`: regras de manutenção do projeto.
- `README.md`: documentação geral, mas as portas descritas nele podem estar desatualizadas; siga o código e o `AGENTS.md`.

### Backend

- `server.ts`: chama `buildServer()`, lê `PORT` e executa `listen` em `0.0.0.0`.
- `app.ts`: monta o Fastify, carrega `.env`, configura CORS, multipart, parser JSON, autenticação global, tratamento de erros e registra as rotas.
- `lib/prisma.ts`: singleton lazy do Prisma. `getPrisma()` só cria o cliente quando necessário e resolve corretamente o caminho relativo do SQLite.
- `types/fastify.d.ts`: estende o Fastify para disponibilizar o usuário autenticado em `request.authUser`.

Por que existe `app.ts` separado de `server.ts`? Isso permite importar e testar a aplicação sem abrir uma porta, enquanto `server.ts` fica apenas com o bootstrap do processo.

## 4. Autenticação e segurança

- `routes/auth.routes.ts` mapeia login, cadastro, sessão atual e logout.
- `controllers/auth.controller.ts` valida entrada, procura usuário e usa `getPrisma()`.
- `lib/auth.ts` faz hash/verificação de senha com `scrypt`, assina/verifica JWT e controla o cookie `pep_token`.
- `lib/cookies.ts` parseia e serializa cookies.
- `app.ts` tem um `onRequest` que protege tudo, exceto `GET /health`, login e cadastro. Ele lê o token, valida o JWT, consulta o usuário no banco e injeta `request.authUser`.

Informalmente: o frontend não precisa mandar o usuário em cada chamada; o cookie prova a sessão e o backend confirma que ela ainda existe. Por isso os controllers também filtram registros pelo `userId`.

## 5. Camadas do backend

O caminho típico é:

```text
rota → controller → service/lib → Prisma ou OpenAI → resposta HTTP
```

- `routes/`: somente URL, método e handler. Não devem conter regra de negócio.
- `controllers/`: traduz HTTP para operação do sistema, valida dono do registro, coordena services e salva no banco.
- `services/`: integrações e transformações complexas.
- `lib/`: funções compartilhadas e regras utilitárias.

Essa separação evita que uma rota saiba detalhes de OpenAI ou que a UI precise conhecer Prisma.

## 6. Domínio de pacientes e consultas

- `patients.controller.ts`: lista com cursor, detecta duplicidades, cria/edita/remove paciente e gera resumo histórico.
- `consultations.controller.ts`: é o maior controller porque orquestra ciclo de vida, áudio, transcrição, IA, salvamento, versões e finalização.
- `schedule.controller.ts`: agendas, calendário, slots, marcação rápida, reagendamento, cancelamento e falta.
- `lib/schedule.ts`: normaliza status/configuração, valida horários, calcula disponibilidade e gera slots.
- `lib/holidays.ts`: calcula feriados brasileiros para impedir/agendar horários conforme configuração.

Status de consulta: `em_espera` → `em_consulta` → `finalizado`; também pode virar `cancelado` ou `faltou`.

## 7. Banco de dados

O schema está em `backend/prisma/schema.prisma`.

- `User`: profissional e dono dos dados.
- `Patient`: cadastro do paciente.
- `Schedule`: agenda/configuração de horários.
- `Consultation`: prontuário, transcrição, campos clínicos, SOAP e status.
- `ConsultationTranscriptSegment`: cada trecho confirmado da transcrição, com sequência e origem.
- `ConsultationAiState`: cursor operacional da IA, metadados de campos e sugestões.
- `ConsultationVersion`: snapshots imutáveis para rastreabilidade.
- `ConsultationAppointmentEvent`: histórico de operações de agenda.
- `LegacyScheduleSettings`: compatibilidade com configuração antiga.

SQLite não possui tipos ricos para todos os campos clínicos. Por isso arrays/objetos são serializados como JSON em strings: o backend usa `serializeExtractedToDb()` e o frontend faz `JSON.parse()` quando precisa exibir.

Regra importante: extração nova não deve apagar informação existente. O merge só aceita valores preenchidos; edições manuais têm prioridade sobre sugestões automáticas.

## 8. Pipeline de IA da consulta

### 8.1 Começo

`POST /api/consultations/:id/start` altera o status e registra `startedAt`. A página de consulta é `frontend/src/app/consultations/[id]/page.tsx`, que busca os dados e renderiza `ConsultationView`.

### 8.2 Gravação

`useRealtimeTranscription.ts` captura o microfone com `getUserMedia` e mantém também um `MediaRecorder` local.

1. Tenta abrir Realtime via WebRTC.
2. Pede um segredo efêmero ao backend em `/:id/realtime-token`.
3. Recebe eventos parciais/completos pelo data channel.
4. Persiste cada transcrição concluída em `/:id/realtime-transcript`.
5. Se Realtime falhar, continua gravando localmente e usa fallback.

Por que o token é criado no backend? A chave permanente da OpenAI nunca deve ir para o navegador. O browser recebe apenas um token temporário.

### 8.3 Fallback de áudio

O arquivo antigo `useAudioRecorder.ts` foi removido porque não tinha referências no frontend. O fluxo executado atualmente está em `useRealtimeTranscription.ts`.

Quando o Realtime está disponível, os eventos completos são enviados para `/:id/realtime-transcript`. Quando ele falha, o hook continua gravando localmente e, ao encerrar, envia o blob completo para `/:id/transcribe`. Portanto, o Whisper não está processando chunks de 5 segundos no fluxo atual.

`speech.service.ts`:

- chama o modelo de transcrição;
- usa prompt/contexto em pt-BR;
- filtra frases típicas de alucinação do Whisper;
- usa confiança de segmentos quando o modelo oferece isso;
- salva o áudio completo em `backend/uploads/audio/`.

O texto é acumulado em `Consultation.transcript`; segmentos confirmados também são guardados para auditoria e processamento incremental.

## 14. Ordem de leitura pela execução real

Para entender uma consulta do início ao fim, leia nesta ordem:

1. `frontend/src/app/consultations/[id]/page.tsx`: a rota abre a consulta e busca os dados.
2. `frontend/src/components/consultation/ConsultationView.tsx`: coordena botões, estado e callbacks.
3. `frontend/src/hooks/useConsultation.ts`: mantém campos, transcript, merge e autosave.
4. `frontend/src/hooks/useRealtimeTranscription.ts`: captura microfone, abre Realtime, recebe eventos e faz fallback local.
5. `frontend/src/services/api.ts`: mostra exatamente quais endpoints cada ação chama.
6. `backend/src/app.ts`: mostra carregamento de ambiente, CORS e autenticação global.
7. `backend/src/routes/consultations.routes.ts`: conecta cada URL ao controller.
8. `backend/src/controllers/consultations.controller.ts`: leia primeiro `startConsultation`, `appendRealtimeTranscript`, `transcribeChunk`, `reinterpretConsultation` e `finalizeConsultation`.
9. `backend/src/services/speech.service.ts`: transcrição Whisper, filtro de alucinações e salvamento do áudio.
10. `backend/src/services/extraction.service.ts`: schemas, prompt, extração incremental, reinterpretação e serialização JSON.
11. `backend/src/services/review.service.ts`: diarização e revisão clínica final.
12. `backend/src/services/soap.service.ts`: geração da evolução SOAP.
13. `backend/prisma/schema.prisma`: confira onde cada resultado é persistido.

Atalho do fluxo de execução:

```text
page.tsx
  → ConsultationView
  → useRealtimeTranscription
  → api.ts
  → consultations.routes.ts
  → consultations.controller.ts
  → speech/extraction/review/soap services
  → Prisma/schema.prisma
```

### 8.4 Extração clínica durante a consulta

`useConsultation.ts` mantém o estado local, mescla campos extraídos, controla status das abas e faz autosave com debounce.

`consultations.controller.ts` usa:

- `extractClinicalDelta()`: extrai somente o que mudou/foi evidenciado nos novos segmentos;
- `mergeSafeClinicalValue()`: evita sobrescrever dado manual ou perder dados;
- `mergeFieldMeta()`: mantém proveniência, confiança, evidências e status;
- `updateAiState`: salva cursor e sugestões auditáveis.

De tempos em tempos, `reinterpretFullTranscript()` relê o transcript completo. Isso corrige contexto perdido entre chunks e consolida o prontuário. O intervalo é controlado por `AI_CLINICAL_REASONING_EVERY_SEGMENTS`.

### 8.5 Finalização

`POST /:id/finalize` executa `runFinalReview()` em `review.service.ts`:

1. `diarizeTranscript()` separa Médico, Paciente e Indefinido.
2. Reextrai os campos sobre o diálogo estruturado.
3. Valida campos que exigem revisão.
4. Gera sugestões e metadados de evidência.
5. `soap.service.ts` gera `subjective`, `objective`, `assessment` e `plan`.
6. Salva SOAP, transcrição estruturada, estado final e status `finalizado`.

A revisão final existe porque uma transcrição corrida é boa para velocidade, mas o diálogo com falas separadas é melhor para atribuir sintomas, achados e decisões ao paciente ou ao médico.

### 8.6 Análise auxiliar

`analysis.service.ts` usa a OpenAI para tópicos da conversa e resumo do histórico do paciente. Essas funções apoiam a tela, mas não substituem os campos do prontuário.

## 9. Frontend

### Rotas de páginas

- `app/page.tsx`: dashboard.
- `app/login/page.tsx`, `app/cadastro/page.tsx`: autenticação.
- `app/patients/page.tsx`: lista.
- `app/patients/new/page.tsx`, `app/patients/[id]/edit/page.tsx`: formulário.
- `app/patients/[id]/page.tsx`: detalhe e histórico.
- `app/consultations/[id]/page.tsx`: consulta em andamento.
- `app/agendas/[id]/page.tsx`: agenda/calendário.
- `app/settings/page.tsx`: configurações.

As páginas são finas: carregam dados com React Query e entregam a renderização a componentes.

### Estado e providers

- `components/providers/SessionProvider.tsx`: verifica sessão, redireciona login e expõe `useSession()`.
- `components/providers/QueryProvider.tsx`: configura TanStack Query, cache e retry.
- `components/layout/AppLayout.tsx`: estrutura visual comum.
- `services/api.ts`: único ponto de HTTP; monta URL, inclui credenciais/cookie e normaliza erros.
- `types/index.ts`: contrato compartilhado entre API e UI.

### Tela de consulta

`ConsultationView.tsx` coordena a experiência: abas, gravação, interpretação, finalização, sugestões, impressão/cópia do SOAP e ferramentas médicas.

Os componentes em `components/consultation/` são partes visuais: cabeçalho, barra de gravação, sidebar, diálogo de confirmação, modal de conversa e painel de ferramentas.

As abas em `components/consultation/tabs/` exibem e editam os grupos: anamnese, antecedentes, hábitos, revisão de sistemas, exame físico, diagnóstico, conduta e SOAP.

## 10. Convenções que explicam o comportamento

- IA sempre retorna JSON: services limpam cercas Markdown e usam fallback seguro.
- Campos clínicos podem ser strings simples ou JSON serializado, conforme o campo.
- Campos manuais ganham da IA; sugestões não são automaticamente tratadas como diagnóstico confirmado.
- Cada edição importante da transcrição cria uma nova `ConsultationVersion`; o histórico não é sobrescrito.
- O backend valida propriedade do registro antes de ler/alterar.
- CORS permite o frontend configurado em `FRONTEND_URL`; por padrão, `http://localhost:3001`.
- O frontend aponta para `NEXT_PUBLIC_API_URL`, por padrão `http://localhost:3000`; como é `NEXT_PUBLIC_*`, a mudança exige novo build.

## 11. Fluxos práticos para manutenção

### Adicionar um campo clínico

Atualize `schema.prisma`, `types/index.ts`, a lista de campos e schemas em `extraction.service.ts`, a serialização/merge no controller e a aba/componente correspondente. Depois rode `npm run db:push`, `npm run db:generate`, `npm run build` no backend e `npm run build` + `npm run lint` no frontend.

### Adicionar endpoint

Crie/ajuste a rota, implemente o controller, adicione o método em `frontend/src/services/api.ts` e conecte a UI. Use `getPrisma()` e retorne erros no formato `{ error: '...' }`.

### Alterar prompt ou modelo

Comece pelo service adequado. Preserve limpeza de JSON, validação Zod e fallback. Confira `OPENAI_*_MODEL` no ambiente e rode o script `backend/src/scripts/clinical-ai-evals.ts` quando a mudança afetar extração clínica.

### Alterar agenda

Concentre regras em `lib/schedule.ts`; o controller deve orquestrar persistência e resposta. Isso evita que calendário, slots e marcação rápida tenham regras divergentes.

## 12. Comandos úteis

Na raiz:

```bash
npm run dev
npm run db:push
npm run db:generate
npm run db:studio
```

Validação:

```bash
cd backend; npm run build
cd frontend; npm run build; npm run lint
```

Portas reais: frontend `http://localhost:3001`, backend `http://localhost:3000`, health check `GET /health`.

## 13. Resumo em uma frase

O PEP IA é uma aplicação Next.js que mantém a consulta responsiva no navegador, envia dados para uma API Fastify autenticada, usa serviços especializados para transformar áudio em evidência clínica estruturada e persiste tudo no SQLite com merge seguro e histórico de versões.
