# Wiki do PEP IA

Documentação de desenvolvedor do **PEP IA** — prontuário eletrônico assistido por IA,
com motor de **formulários clínicos dinâmicos**, governança de consentimento e
evidência literal. Tudo em português do Brasil.

> Esta wiki reflete o **código atual** (motor dinâmico). Os arquivos [`ARQUITETURA.md`](../../ARQUITETURA.md)
> e [`AGENTS.md`](../../AGENTS.md) na raiz descrevem parcialmente uma **versão anterior**
> (prontuário de campos fixos, status em inglês). Onde houver divergência, **o código e esta wiki mandam**.

---

## 📚 Páginas

| # | Página | O que cobre |
|---|--------|-------------|
| 01 | [Visão geral e stack](01-visao-geral.md) | O que é, stack, portas, diagrama de camadas, glossário |
| 02 | [Fluxo de uma consulta (ponta a ponta)](02-fluxo-de-uma-consulta.md) | Do agendamento à evolução assinada, arquivo por arquivo |
| 03 | [Backend — rotas e controllers](03-backend-rotas-controllers.md) | Cada endpoint → controller → função, com números de linha |
| 04 | [Pipeline de IA](04-pipeline-ia.md) | **Onde a IA interpreta e preenche o formulário**, gates de autorização, evidência, quarentena |
| 05 | [Motor de formulários dinâmicos](05-motor-formularios.md) | Definição, manifesto, versões imutáveis, presets, editor |
| 06 | [Services e lib do backend](06-services-lib.md) | Catálogo de cada service e utilitário |
| 07 | [Banco de dados](07-banco-de-dados.md) | Cada model do Prisma e por que existe |
| 08 | [Frontend](08-frontend.md) | Páginas, componentes, hooks, camada de API, tipos |
| 09 | [Segurança, consentimento e retenção](09-seguranca-consentimento-retencao.md) | Auth, criptografia, consentimentos, retenção, auditoria |
| 10 | [Mapa de funções ("onde está a função que…?")](10-mapa-de-funcoes.md) | Índice por tarefa: encontre a função certa em segundos |

---

## 🔎 Respostas rápidas ("onde está…?")

> Página completa: [Mapa de funções](10-mapa-de-funcoes.md).

- **A função que interpreta a fala e preenche o formulário?**
  Gatilho HTTP `reinterpretDynamicConsultation` ([dynamic-consultations.controller.ts:1953](../../backend/src/controllers/dynamic-consultations.controller.ts#L1953))
  → orquestrador `runDynamicInterpretation` ([:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767))
  → extração pela IA `extractDynamicFormDelta` ([dynamic-clinical-ai.service.ts:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992))
  → gravação nos campos `applyAiOutput` ([:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613)).

- **Quem decide se uma voz pode preencher o campo?**
  `canUseSegmentForAutomaticFormFill` ([dynamic-clinical-ai.service.ts:631](../../backend/src/services/dynamic-clinical-ai.service.ts#L631)).

- **Onde a IA gera a evolução SOAP/DAP/BIRP?**
  `generateDynamicClinicalDocument` ([dynamic-clinical-ai.service.ts:1417](../../backend/src/services/dynamic-clinical-ai.service.ts#L1417)),
  disparada por `generateDynamicDocument` ([dynamic-consultations.controller.ts:2030](../../backend/src/controllers/dynamic-consultations.controller.ts#L2030)).

- **Onde os endpoints são registrados?**
  [backend/src/app.ts:108](../../backend/src/app.ts#L108) + arquivos em [backend/src/routes/](../../backend/src/routes/).

- **Onde o frontend chama a API da consulta?**
  [frontend/src/services/dynamic-consultation-api.ts](../../frontend/src/services/dynamic-consultation-api.ts).

- **Onde ficam os campos clínicos do prontuário?**
  Não são colunas fixas: vivem em `ConsultationFieldValue` ([schema.prisma:313](../../backend/prisma/schema.prisma#L313)),
  regidos pelo formulário publicado.

---

## 🛠️ Comandos essenciais

```bash
npm install            # instala os dois workspaces (raiz)
npm run db:push        # cria/atualiza o SQLite
npm run db:generate    # regenera o Prisma Client após mexer no schema
npm run dev            # sobe backend (3000) + frontend (3001)
```

Validação por workspace: `npm run build` (backend e frontend), `npm run lint` e
`npm test` (frontend), testes `*.test.ts` no backend rodam via `tsx --test`.

---

## ✍️ Como manter esta wiki

- Cada página aponta para `arquivo:linha`. Ao mover funções, **atualize os links** (os números de linha envelhecem).
- Prefira descrever **responsabilidade e contrato** da função a colar o corpo dela — o corpo muda, a intenção não.
- Novidade de arquitetura → registre na página de camada correspondente **e** no [Mapa de funções](10-mapa-de-funcoes.md).
- Idioma: **pt-BR** em todo o conteúdo, comentários e nomes de seções.
