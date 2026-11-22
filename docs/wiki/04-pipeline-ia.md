# 04 — Pipeline de IA

[← Voltar ao índice](README.md)

Esta é a página mais importante para quem vai mexer na inteligência do sistema.
Arquivo central: [dynamic-clinical-ai.service.ts](../../backend/src/services/dynamic-clinical-ai.service.ts)
(o que costuma estar aberto no editor). Orquestração no controller
[dynamic-consultations.controller.ts](../../backend/src/controllers/dynamic-consultations.controller.ts).

## 🎯 "Onde está a função que interpreta a fala e preenche o formulário?"

Três camadas, nesta ordem:

```text
POST /api/consultations/:id/dynamic-reinterpret
  → reinterpretDynamicConsultation   controller:1953   (valida estado + consentimento)
     → runDynamicInterpretation      controller:1767   (cursor, lease, contexto, persistência)
        → extractDynamicFormDelta    service:992       ★ A IA lê os segmentos e devolve os updates
        → applyAiOutput              controller:1613   (grava no formulário ou manda p/ quarentena)
```

- **`extractDynamicFormDelta`** ([service:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992)) é
  **onde a IA "pensa"**: monta o prompt, envia os segmentos autorizados + o manifesto do
  formulário, aplica o schema estruturado e valida cada candidato antes de devolvê-lo.
- **`applyAiOutput`** ([controller:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613)) é
  **onde o valor efetivamente chega ao campo** (`ConsultationFieldValue`) — ou vira item de
  quarentena / alerta de risco. Nunca sobrescreve valor `manual` ou `confirmado`.

## Dois momentos de execução

| Momento | Gatilho | `finalReview` | Modelo (env) | Fontes aceitas |
|---------|---------|:---:|--------------|----------------|
| **Incremental** (durante a fala) | `reinterpretDynamicConsultation` sem `force` | não | `OPENAI_DYNAMIC_INCREMENTAL_MODEL` (`gpt-5.6-terra`), reasoning `low` | também voz de sessão *provisória* (antes da diarização) |
| **Revisão final** (ao gerar evolução) | `generateDynamicDocument` → `runDynamicInterpretation({ finalReview: true })` | sim | `OPENAI_DYNAMIC_FINAL_MODEL` (`gpt-5.6-sol`), reasoning `medium` | **só** voz identificada e autorizada |

Config de modelo/esforço lida em [service:1034](../../backend/src/services/dynamic-clinical-ai.service.ts#L1034).
A chamada à OpenAI é encapsulada em `createStructuredResponse` ([openai-responses.service.ts:51](../../backend/src/services/openai-responses.service.ts#L51)).

## O orquestrador `runDynamicInterpretation` ([controller:1767](../../backend/src/controllers/dynamic-consultations.controller.ts#L1767))

Responsabilidades, na ordem em que acontecem:

1. **Cursor** — lê/cria `ConsultationAiState`; `lastProcessedSequence` marca até onde já processou.
2. **Lease (posse)** — grava `processingThroughSequence`/`processingStartedAt` para evitar duas
   interpretações concorrentes; concessões expiradas (>60 s, `DYNAMIC_AI_PROCESSING_LEASE_MS`) são retomadas.
3. **Janela de contexto** — na passada incremental, além dos segmentos novos, anexa até
   `DYNAMIC_INCREMENTAL_CONTEXT_SEGMENTS` (12) anteriores marcados `contextOnly: true` — servem
   só para interpretar respostas curtas ("sim", "há dois dias"), **não** geram update sozinhos.
4. **Chamada** — `extractDynamicFormDelta(...)`.
5. **Renova a posse** antes de persistir; se outra requisição assumiu, o resultado é **descartado**
   sem tocar no prontuário.
6. **Persiste** — `applyAiOutput`, e avança o cursor (na revisão final o cursor **não** avança).

## Dentro de `extractDynamicFormDelta` ([service:992](../../backend/src/services/dynamic-clinical-ai.service.ts#L992))

1. **Seleciona campos graváveis** — ignora os de modo `sem_acesso`.
2. **Seleciona segmentos** por autorização (`canUseSegmentForDynamicExtraction` [:680](../../backend/src/services/dynamic-clinical-ai.service.ts#L680)):
   fala de participante não autorizado já vai para quarentena `falante_nao_autorizado`.
3. **Monta o prompt** com `DYNAMIC_AI_INSTRUCTIONS` ([:214](../../backend/src/services/dynamic-clinical-ai.service.ts#L214)) —
   as regras anti-alucinação e anti-injeção. **O manifesto e a transcrição são declarados dados não confiáveis.**
4. **Schema estruturado** — `dynamicExtractionSchema` ([:288](../../backend/src/services/dynamic-clinical-ai.service.ts#L288))
   restringe `fieldId` aos campos graváveis e força a forma de cada `update`.
5. **Valida cada candidato** (loop [:1093](../../backend/src/services/dynamic-clinical-ai.service.ts#L1093)) — ver barreiras abaixo.
6. Devolve `{ updates, quarantine, riskAlerts }`.

## 🛡️ As barreiras (por que um valor entra ou é barrado)

Cada `update` só sobrevive se passar por **todas** estas checagens:

| Barreira | Função | O que garante |
|----------|--------|---------------|
| Campo/documento/permissão válidos | `dynamicOperationMatchesPolicy` ([:982](../../backend/src/services/dynamic-clinical-ai.service.ts#L982)) + `validateDynamicFieldValue` ([:448](../../backend/src/services/dynamic-clinical-ai.service.ts#L448)) | O `fieldId` existe, pertence ao documento certo, o modo permite a operação e o **tipo do valor** é válido |
| Evidência literal | `validateDynamicEvidence` ([:479](../../backend/src/services/dynamic-clinical-ai.service.ts#L479)) | Cada citação existe **literalmente** no segmento (mesmo `sequence`), com tamanho mínimo |
| Evidência no lote atual | `hasCurrentBatchEvidence` ([:599](../../backend/src/services/dynamic-clinical-ai.service.ts#L599)) | Pelo menos uma citação vem de segmento novo (não só da janela `contextOnly`) |
| Suporte lexical | `evidenceSupportsValue` ([:563](../../backend/src/services/dynamic-clinical-ai.service.ts#L563)) | O valor tem sobreposição de tokens com a citação → barra alucinação |
| Falante autorizado | `hasUnauthorizedSpeaker` ([:591](../../backend/src/services/dynamic-clinical-ai.service.ts#L591)) | A evidência não pertence a voz não autorizada |
| Fonte não nuclear atribuída | `valueExplicitlyAttributesReviewEvidence` ([:780](../../backend/src/services/dynamic-clinical-ai.service.ts#L780)) | Se veio de acompanhante/voz ambígua, o texto **cita a fonte** ("Segundo a mãe…") |
| Revisão obrigatória | lógica `requiresReview` ([:1185](../../backend/src/services/dynamic-clinical-ai.service.ts#L1185)) | Papel semântico crítico, checkbox, baixa confiança ou incerteza → `revisao_obrigatoria` |

O que falha vira `DynamicQuarantineCandidate` com um `kind`: `falante_nao_autorizado`,
`sem_evidencia`, `campo_invalido`, `irrelevante`, `conflito`, `possivel_alucinacao`.

## Quem pode sustentar o quê — as funções de elegibilidade de voz

Três "portões" definem o que cada segmento pode alimentar (todos em `dynamic-clinical-ai.service.ts`):

| Função | Linha | Autoriza… |
|--------|-------|-----------|
| `canUseSegmentForAutomaticFormFill` | [:631](../../backend/src/services/dynamic-clinical-ai.service.ts#L631) | **Preenchimento automático** — só `profissional` e `paciente` identificados |
| `canUseSegmentForMandatoryReviewSuggestion` | [:646](../../backend/src/services/dynamic-clinical-ai.service.ts#L646) | **Sugestão com revisão obrigatória** — acompanhante, relação contextual, voz ambígua consentida |
| `canUseSegmentForFinalDocumentDraft` | [:663](../../backend/src/services/dynamic-clinical-ai.service.ts#L663) | Entrar na **evolução** (como material atribuído de revisão) |

> Consentir em **processar** uma voz não muda seu **papel semântico**: só núcleo (profissional/paciente)
> preenche automaticamente. Isso é a espinha dorsal da governança.

### Classificação "review-only" (falas não nucleares)

Antes que uma fala de acompanhante/voz não identificada possa gerar sugestão, alerta ou entrar
no rascunho, ela é classificada em `reviewOnlyAssessments`
(`validateDynamicReviewOnlyAssessments` [:838](../../backend/src/services/dynamic-clinical-ai.service.ts#L838)):
`clinicalRelevance` (`sobre_paciente` / `fala_propria_ou_sobre_terceiro` / `conversa_alheia` / `indeterminado`)
e `riskRelevance`. Só `sobre_paciente` habilita uma sugestão; o resto fica no histórico e não alimenta nada.

## Risco

Alertas de risco (`suicidio`, `autolesao`, `violencia`, `vulnerabilidade`, `outro`) são validados em
`validateDynamicRiskAlertCandidate` ([:943](../../backend/src/services/dynamic-clinical-ai.service.ts#L943)) e
**sempre** viram item de quarentena `alerta_risco` para avaliação humana — nunca conduta automática,
nunca risco de terceiro atribuído ao paciente. Um `alerta_risco` pendente **bloqueia** a confirmação da evolução.

## Persistência — `applyAiOutput` ([controller:1613](../../backend/src/controllers/dynamic-consultations.controller.ts#L1613))

Para cada `update`:
- modo `sugerir_revisao` **ou** `reviewStatus: revisao_obrigatoria` → vira quarentena `sugestao_ia` (não grava no campo);
- campo já `manual`/`confirmado` → vira quarentena `conflito` (**IA não sobrescreve**);
- caso contrário → grava/atualiza `ConsultationFieldValue` (`source: ia`) + evento imutável `ConsultationFieldEvent`.

Na revisão final (`fullReconciliation`), valores de IA que perderam suporte são removidos via
`staleAiValuesAfterFullReconciliation` ([dynamic-ai-reconciliation.service.ts:19](../../backend/src/services/dynamic-ai-reconciliation.service.ts#L19)).

## Geração da evolução — `generateDynamicClinicalDocument` ([service:1417](../../backend/src/services/dynamic-clinical-ai.service.ts#L1417))

- Formatos e seções em `FORMAT_SECTIONS` ([:1370](../../backend/src/services/dynamic-clinical-ai.service.ts#L1370)) (SOAP/DAP/BIRP).
- Cada seção precisa de **≥ 1 citação literal válida**; caso contrário a geração falha.
- Só usa segmentos de `canUseSegmentForFinalDocumentDraft`; falas não nucleares entram **atribuídas** e geram `warnings`.
- Separa valores por documento com `selectValuesForDocument` ([:1357](../../backend/src/services/dynamic-clinical-ai.service.ts#L1357)) —
  a evolução `compartilhavel` nunca vê campos do `restrito`.

## Tópicos da conversa — `suggestDynamicConversationTopics` ([service:1235](../../backend/src/services/dynamic-clinical-ai.service.ts#L1235))

Organiza assuntos clínicos com evidência literal; apoia a tela, não substitui os campos.

## Variáveis de ambiente da IA

| Variável | Uso | Default |
|----------|-----|---------|
| `OPENAI_API_KEY` | Obrigatória para toda a IA | — |
| `OPENAI_DYNAMIC_INCREMENTAL_MODEL` | Extração incremental / tópicos | `gpt-5.6-terra` |
| `OPENAI_DYNAMIC_FINAL_MODEL` | Revisão final / evolução | `gpt-5.6-sol` |
| `OPENAI_DYNAMIC_INCREMENTAL_REASONING` | Esforço incremental | `low` |
| `OPENAI_DYNAMIC_FINAL_REASONING` | Esforço final | `medium` |

## Ao mexer no pipeline

- Preserve **schema estruturado + validação de evidência + fallback seguro**.
- Não afrouxe as funções de elegibilidade de voz sem entender a governança de consentimento
  ([09 — Segurança](09-seguranca-consentimento-retencao.md)).
- Rode as evals: [backend/src/scripts/dynamic-psychology-evals.ts](../../backend/src/scripts/dynamic-psychology-evals.ts)
  e os testes `dynamic-clinical-ai.service.test.ts` / `dynamic-ai-reconciliation.service.test.ts`.

## Próximo

→ [05 — Motor de formulários dinâmicos](05-motor-formularios.md)
