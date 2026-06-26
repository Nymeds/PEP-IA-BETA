# PEP IA — Prontuário Eletrônico com Inteligência Artificial

Sistema de prontuário eletrônico que usa IA para transcrever consultas médicas em tempo real e preencher automaticamente os campos do prontuário.

---

## Como funciona

1. O médico clica em **Iniciar Sessão** (botão de microfone na parte inferior da tela)
2. A conversa é gravada e enviada para transcrição a cada 8 segundos
3. A IA transcreve a fala e extrai informações clínicas automaticamente
4. Os campos do prontuário são preenchidos em tempo real enquanto a consulta acontece
5. As abas avançam sozinhas conforme o assunto muda (anamnese → antecedentes → exame físico etc.)
6. Ao encerrar, o médico clica em **Gerar SOAP** para criar a evolução clínica completa
7. Revisão e salvamento final

---

## Pré-requisitos

- [Node.js](https://nodejs.org) versão 18 ou superior
- Chave de API da OpenAI com acesso aos modelos GPT-4.1 e Whisper

---

## Instalação

### 1. Clone ou baixe o projeto

Certifique-se de estar na pasta `PEP/`.

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure o arquivo `.env`

Abra o arquivo `.env` na raiz do projeto e preencha sua chave da OpenAI:

```env
OPENAI_API_KEY=sk-sua-chave-aqui
```

Os demais valores já estão configurados para desenvolvimento local e não precisam ser alterados.

### 4. Crie o banco de dados

```bash
cd backend
npx prisma db push
cd ..
```

Isso cria o arquivo `backend/prisma/dev.db` (SQLite local, sem instalação adicional).

---

## Rodando o projeto

Você precisa de **dois terminais** abertos.

### Terminal 1 — Backend

```bash
cd backend
npx tsx src/server.ts
```

Saída esperada:
```
🚀 Backend rodando em http://localhost:3000
```

### Terminal 2 — Frontend

```bash
cd frontend
npx next dev -p 3001
```

Saída esperada:
```
▲ Next.js 15.1.3
- Local: http://localhost:3001
```

### Acessar o sistema

Abra o navegador em: **http://localhost:3001**

---

## Estrutura de pastas

```
PEP/
├── .env                          # Variáveis de ambiente (edite aqui)
├── package.json                  # Raiz do monorepo
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # Modelo do banco de dados
│   │   └── dev.db                # Banco SQLite (criado após db push)
│   └── src/
│       ├── server.ts             # Entrada do servidor
│       ├── routes/               # Rotas HTTP
│       ├── controllers/          # Lógica das rotas
│       ├── services/
│       │   ├── speech.service.ts     # Transcrição de áudio (OpenAI Whisper)
│       │   ├── extraction.service.ts # Extração de dados clínicos (GPT-4.1)
│       │   └── soap.service.ts       # Geração do SOAP (GPT-4.1)
│       └── lib/
│           └── prisma.ts         # Cliente do banco de dados
│
└── frontend/
    └── src/
        ├── app/                  # Páginas (Next.js App Router)
        │   ├── page.tsx              # Dashboard
        │   ├── patients/             # Lista, cadastro e detalhe de pacientes
        │   └── consultations/[id]/   # Tela principal da consulta
        ├── components/
        │   ├── consultation/
        │   │   ├── TabSidebar.tsx    # Abas laterais com indicadores de status
        │   │   ├── RecordingBar.tsx  # Barra inferior com microfone e transcrição
        │   │   └── tabs/             # Conteúdo de cada aba do prontuário
        │   └── patients/             # Componentes de paciente
        ├── hooks/
        │   ├── useAudioRecorder.ts   # Gravação de áudio em chunks
        │   └── useConsultation.ts    # Estado da consulta e merge dos dados da IA
        ├── services/
        │   └── api.ts            # Chamadas para o backend
        └── types/
            └── index.ts          # Tipos TypeScript compartilhados
```

---

## API do Backend

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/patients` | Listar todos os pacientes |
| `POST` | `/api/patients` | Cadastrar paciente |
| `GET` | `/api/patients/:id` | Buscar paciente com histórico |
| `PUT` | `/api/patients/:id` | Atualizar paciente |
| `DELETE` | `/api/patients/:id` | Excluir paciente |
| `POST` | `/api/consultations` | Criar consulta |
| `GET` | `/api/consultations/:id` | Buscar consulta |
| `PUT` | `/api/consultations/:id` | Atualizar consulta |
| `POST` | `/api/consultations/:id/transcribe` | Transcrever chunk de áudio |
| `POST` | `/api/consultations/:id/audio` | Salvar gravação completa |
| `POST` | `/api/consultations/:id/finalize` | Gerar SOAP com IA |

---

## Variáveis de ambiente

Todas no arquivo `.env` na raiz do projeto:

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `OPENAI_API_KEY` | **Obrigatório.** Sua chave da OpenAI | — |
| `OPENAI_TRANSCRIPTION_MODEL` | Modelo de transcrição | `whisper-1` |
| `OPENAI_EXTRACTION_MODEL` | Modelo de extração clínica | `gpt-4.1` |
| `OPENAI_SOAP_MODEL` | Modelo para geração do SOAP | `gpt-4.1` |
| `PORT` | Porta do backend | `3000` |
| `FRONTEND_URL` | URL do frontend (para CORS) | `http://localhost:3001` |
| `DATABASE_URL` | Caminho do banco SQLite. Caminhos `file:` relativos resolvem a partir de `backend/prisma/` | `file:./dev.db` |
| `NEXT_PUBLIC_API_URL` | URL do backend usada pelo frontend | `http://localhost:3000` |

> **Nota:** o filtro de alucinações da transcrição funciona por completo apenas com
> `whisper-1` (depende do formato `verbose_json`). Com outros modelos sobra apenas o
> bloqueio por lista de frases conhecidas.

---

## Abas do prontuário

| Aba | Conteúdo |
|-----|---------|
| **Anamnese** | Queixa principal, HDA, início dos sintomas, intensidade, fatores de melhora/piora |
| **Antecedentes** | Doenças prévias, cirurgias, internações, alergias, medicamentos em uso, história familiar |
| **Hábitos de Vida** | Tabagismo, etilismo, drogas, atividade física, sono, alimentação, ocupação |
| **Revisão de Sistemas** | Sintomas por sistema: geral, respiratório, cardiovascular, GI, neurológico, psiquiátrico |
| **Exame Físico** | Sinais vitais, antropometria, estado geral, exame segmentar |
| **Diagnóstico** | Hipótese principal, diferenciais, diagnóstico confirmado, CID-10 |
| **Conduta** | Plano terapêutico, orientações ao paciente, encaminhamentos, data de retorno |
| **SOAP / Evolução** | Subjetivo, Objetivo, Avaliação, Plano — gerado automaticamente pela IA |

---

## Indicadores das abas

Durante a gravação, cada aba exibe um ícone de status:

- ✏ **Azul pulsando** — A IA está preenchendo campos desta aba agora
- ⚠ **Âmbar** — Aba acessada mas com campos incompletos
- ✓ **Verde** — Aba completa

---

## Arquivos gerados pelo sistema

| Arquivo | Local |
|---------|-------|
| Banco de dados | `backend/prisma/dev.db` |
| Gravações de áudio | `backend/uploads/audio/` |

> As gravações de áudio são salvas permanentemente para fins de auditoria, conforme especificado.

---

## Observações

- Este é um projeto experimental (MVP) para estudo e validação de conceito
- Não possui autenticação de usuários
- Não é homologado para uso clínico em produção
- Dados são armazenados localmente no arquivo SQLite
- A qualidade da transcrição depende do microfone e do ambiente (evite ruídos)
- Recomenda-se usar fones com microfone para melhor resultado
