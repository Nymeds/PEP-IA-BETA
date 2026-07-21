# PEP IA — prontuário eletrônico assistido por IA

Beta experimental em português do Brasil. O sistema mantém o prontuário fixo
original como motor `legacy` e habilita, sob feature flag, um motor dinâmico para
Psicologia.

> Não homologado para uso clínico real. Use somente dados fictícios ou um piloto
> controlado até concluir revisão jurídica, RIPD, validação profissional e política
> de fornecedores.

## O que está disponível

- autenticação e isolamento dos dados por profissional;
- agenda mensal, semanal e linha do tempo diária;
- prontuário legado preservado para consultas existentes e outras especialidades;
- **Meu formulário** (`/formularios`) com rascunho, cópia, versão imutável,
  publicação, formulário padrão, arquivamento e histórico;
- editor visual com canvas livre no desktop, grade de 8 px, prevenção de
  sobreposição, redimensionamento, desfazer/refazer, teclado e reflow mobile;
- preset de Psicologia com prontuário compartilhável e registro psicológico
  restrito, incluindo Familiares e rede e Medicamentos;
- pinagem da versão ao agendar e troca auditada somente antes do início;
- campos e abas renderizados pelo schema publicado, com autosave otimista;
- consentimentos separados de áudio, transcrição/IA e participantes;
- evidência literal por campo, identificação de vozes, quarentena e revisão humana;
- evolução em SOAP, DAP ou BIRP, inclusive fluxo totalmente manual;
- exportações separadas e retenção por classe documental;
- criptografia de áudio e conteúdo restrito em repouso em produção.

A IA é sempre assistente. Conteúdo crítico, risco, hipóteses, condutas,
diagnósticos, avaliações psicológicas e referências farmacológicas exigem revisão
do profissional.

## Requisitos

- Node.js 18 ou superior;
- npm;
- chave da OpenAI para os recursos de transcrição e IA.

## Instalação e execução

Na raiz do monorepo:

```bash
npm install
npm run db:push
npm run dev
```

- frontend: <http://localhost:3001>
- backend: <http://localhost:3000>

Também é possível iniciar separadamente com `npm run dev:backend` e
`npm run dev:frontend`.

## Variáveis de ambiente

Copie `.env.EXAMPLE` para `.env` e revise, no mínimo:

| Variável | Uso |
|---|---|
| `OPENAI_API_KEY` | Transcrição e assistência clínica |
| `DYNAMIC_FORMS_PSYCHOLOGY` | Motor dinâmico de Psicologia no backend; use `false` como kill switch |
| `NEXT_PUBLIC_DYNAMIC_FORMS_PSYCHOLOGY` | Experiência correspondente no frontend; use `false` para ocultar |
| `DATA_ENCRYPTION_KEY` | Chave de 32 bytes para dados sensíveis; obrigatória em produção |
| `DATABASE_URL` | SQLite; caminhos relativos são ancorados em `backend/prisma/` |
| `NEXT_PUBLIC_API_URL` | URL pública do backend, padrão `http://localhost:3000` |

Consulte [`.env.EXAMPLE`](./.env.EXAMPLE) para modelos, retenção e demais opções.

## Arquitetura

O repositório é um monorepo npm com:

- `backend/`: Fastify 5, Prisma 6, SQLite e SDK OpenAI;
- `frontend/`: Next.js 15, React 19, TanStack Query e Tailwind;
- `backend/src/services/clinical-record-engine.service.ts`: seleção entre
  `LegacyFixedEngine` e `DynamicFormEngine`;
- `backend/src/presets/psychology-form.preset.ts`: definição inicial de Psicologia;
- `frontend/src/components/forms/`: gerenciador e editor de formulários;
- `frontend/src/components/consultation/dynamic/`: consulta dinâmica e revisão.

Cada versão publicada armazena uma definição canônica e um manifesto de runtime.
Consultas dinâmicas ficam pinadas nessa versão; uma publicação futura não altera
consultas já agendadas.

## Validação

```bash
npm run db:generate
npm run db:push
npm run build --workspace=backend
npm test --workspace=backend
npm run lint --workspace=frontend
npm test --workspace=frontend
npm run build --workspace=frontend
npm run test:e2e --workspace=frontend
npm run eval:psychology --workspace=backend
```

`eval:psychology` valida o corpus sintético sem chamar a API. Para executar os
casos contra os modelos configurados, acrescente `-- --execute` e forneça uma chave
válida.

## Segurança operacional

- nenhum valor de IA é aceito sem campo permitido, tipo válido, falante autorizado
  e citação literal no segmento normalizado;
- falas desconhecidas não alimentam o prontuário nem documentos finais;
- conteúdo manual prevalece e nunca é apagado silenciosamente;
- correções de documentos confirmados geram adendo imutável;
- exportações compartilháveis nunca incluem o registro restrito;
- áudio não é permanente: o prazo é configurável e executado pelo motor de retenção.
