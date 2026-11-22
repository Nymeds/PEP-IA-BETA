# 05 — Motor de formulários dinâmicos

[← Voltar ao índice](README.md)

O que substituiu o prontuário de campos fixos. Toda consulta roda sobre um **formulário
versionado por especialidade**. Arquivo de contrato:
[clinical-forms.service.ts](../../backend/src/services/clinical-forms.service.ts);
ciclo de vida dos templates: [form-templates.service.ts](../../backend/src/services/form-templates.service.ts).

## Modelo conceitual

```text
SpecialtyProfile (ex.: psicologia, clinica_geral)
   └── ClinicalFormTemplate           rascunho editável (draftDefinitionJson)
          └── ClinicalFormTemplateVersion   snapshot IMUTÁVEL (definition + manifest + checksum)
                 └── Consultation.formTemplateVersionId   ← consulta PINADA a esta versão
```

Publicar uma nova versão **não afeta** consultas já pinadas. A consulta guarda também
`formDefinitionSnapshot` para blindagem extra.

## Anatomia de uma definição (`ClinicalFormDefinition`)

Estrutura validada por Zod ([clinical-forms.service.ts](../../backend/src/services/clinical-forms.service.ts),
tipos derivados em [:605](../../backend/src/services/clinical-forms.service.ts#L605)):

```text
definition
├── schemaVersion: 'clinical-form-v1'
├── specialtyCode, name, defaultDocumentFormat (SOAP|DAP|BIRP)
└── documents[]                    (kind: 'compartilhavel' | 'restrito')
     └── tabs[]                    (abas visuais)
          └── elements[]           (campos + títulos + divisores)
```

### Tipos de campo — `CLINICAL_FIELD_TYPES` ([:7](../../backend/src/services/clinical-forms.service.ts#L7))
`texto_curto`, `texto_longo`, `checkbox`, `selecao_unica`, `selecao_multipla`, `numero`,
`data`, `titulo`, `divisor`, `grupo_repetivel`.

### Política de IA por campo — `CLINICAL_AI_MODES` ([:19](../../backend/src/services/clinical-forms.service.ts#L19))
`sem_acesso` · `preencher` · `resumir` · `sugerir_revisao`.
Cada política precisa de documentação (`description`, evidências permitidas/proibidas, exemplos) —
imposto por `requireAiPolicyDocumentation` ([:108](../../backend/src/services/clinical-forms.service.ts#L108)).

### Papéis semânticos — `CLINICAL_SEMANTIC_ROLES` ([:36](../../backend/src/services/clinical-forms.service.ts#L36))
Rótulo clínico (ex.: `risco_protecao`, `medicamentos`, `exame_fisico_sinais_vitais`,
`avaliacao_risco_detalhada`). Dois efeitos:
- alguns são **críticos** e forçam revisão obrigatória no pipeline (ver [04](04-pipeline-ia.md));
- alguns são **review-only** e/ou devem ficar no documento restrito (`REVIEW_ONLY_SEMANTIC_ROLES` [:86](../../backend/src/services/clinical-forms.service.ts#L86)).
- Cada especialidade exige um conjunto de papéis (`SPECIALTY_REQUIRED_ROLES` [:61](../../backend/src/services/clinical-forms.service.ts#L61)).

## Funções do contrato

| Função | Linha | Papel |
|--------|-------|-------|
| `parseFormDefinition` | [:667](../../backend/src/services/clinical-forms.service.ts#L667) | Valida definição **publicável** (Zod + sanitização + limite 2 MB) |
| `parseDraftFormDefinition` | [:672](../../backend/src/services/clinical-forms.service.ts#L672) | Valida **rascunho** (papéis regulatórios podem faltar) |
| `buildRuntimeManifest` | [:712](../../backend/src/services/clinical-forms.service.ts#L712) | Achata `documents→tabs→elements` em `documents→fields` para o runtime/IA |
| `stringifyFormDefinition` | [:744](../../backend/src/services/clinical-forms.service.ts#L744) | Serializa a definição validada |
| `sanitizeUnknown` | [:652](../../backend/src/services/clinical-forms.service.ts#L652) | Remove control chars e cercas markdown de **todo** texto (anti-injeção) |

### Manifesto (`FormRuntimeManifest`, [:610](../../backend/src/services/clinical-forms.service.ts#L610))

É a forma que a IA e o renderer consomem. Diferenças-chave para a definição:
- **achatado**: sem abas/títulos/divisores — só campos com `id`, `tabId`, `type`, `semanticRole`, `ai`, `options`, `columns`;
- é o que `extractDynamicFormDelta` recebe como `formRuntimeManifest`.

`buildRuntimeManifest` filtra `titulo`/`divisor` ([:725](../../backend/src/services/clinical-forms.service.ts#L725)) e preserva `ai`/`semanticRole`.

## Ciclo de vida dos templates — [form-templates.service.ts](../../backend/src/services/form-templates.service.ts)

| Função | Linha | Papel |
|--------|-------|-------|
| `ensureBaseSpecialties` | [:69](../../backend/src/services/form-templates.service.ts#L69) | Semeia `SpecialtyProfile` (psicologia, clínica geral) |
| `ensureBaseFormTemplatesForUser` | [:108](../../backend/src/services/form-templates.service.ts#L108) | Cria os presets do usuário no cadastro |
| `migrateOwnedRecordsToDynamic` | [:172](../../backend/src/services/form-templates.service.ts#L172) | Migra registros antigos para o modo dinâmico |
| `createOwnedFormTemplate` | [:356](../../backend/src/services/form-templates.service.ts#L356) | Novo rascunho |
| `updateOwnedFormTemplate` | [:395](../../backend/src/services/form-templates.service.ts#L395) | Edita rascunho (revisão otimista; `FormTemplateRevisionConflictError`) |
| `publishOwnedFormTemplate` | [:438](../../backend/src/services/form-templates.service.ts#L438) | **Publica** → cria `ClinicalFormTemplateVersion` imutável (definition + manifest + checksum) |
| `copyOwnedFormTemplate` | [:486](../../backend/src/services/form-templates.service.ts#L486) | Duplica |
| `setOwnedDefaultFormTemplate` | [:506](../../backend/src/services/form-templates.service.ts#L506) | Define o formulário padrão da especialidade |
| `archiveOwnedFormTemplate` | [:521](../../backend/src/services/form-templates.service.ts#L521) | Arquiva (bloqueia se em uso — `FormTemplateArchiveConflictError`) |
| `resolveScheduleTemplate` | [:564](../../backend/src/services/form-templates.service.ts#L564) | Qual template a agenda usa |
| `resolvePublishedVersionForSchedule` | [:601](../../backend/src/services/form-templates.service.ts#L601) | Qual **versão** pinar ao agendar |

Códigos de especialidade: `PSYCHOLOGY_SPECIALTY_CODE` / `GENERAL_CLINIC_SPECIALTY_CODE` ([:12](../../backend/src/services/form-templates.service.ts#L12)).

## Presets

- Psicologia: [presets/psychology-form.preset.ts](../../backend/src/presets/psychology-form.preset.ts)
  (`PSYCHOLOGY_FORM_PRESET`, `PSYCHOLOGY_PRESET_KEY = 'psicologia-essencial-v1'`).
- Clínica Geral: [presets/general-clinic-form.preset.ts](../../backend/src/presets/general-clinic-form.preset.ts)
  (`GENERAL_CLINIC_FORM_PRESET`, `GENERAL_CLINIC_PRESET_KEY = 'clinica-geral-essencial-v1'`).

São a melhor referência de **como** montar uma definição real (documentos, abas, campos, políticas de IA).

## Editor visual (frontend)

- Gerenciador: [FormTemplatesManager.tsx](../../frontend/src/components/forms/FormTemplatesManager.tsx) (`/formularios`).
- Editor de canvas: [FormTemplateEditor.tsx](../../frontend/src/components/forms/FormTemplateEditor.tsx) (`/formularios/[id]`).
- Layout do canvas (grid, colisão, reflow): [lib/form-layout.ts](../../frontend/src/lib/form-layout.ts).
- Ícones de campo: [FormFieldIcon.tsx](../../frontend/src/components/forms/FormFieldIcon.tsx).
- Tipos compartilhados: [types/forms.ts](../../frontend/src/types/forms.ts); camada HTTP: [services/forms-api.ts](../../frontend/src/services/forms-api.ts).

## Como adicionar um novo campo/tipo

1. Se for **tipo novo**: `CLINICAL_FIELD_TYPES` + validação em `validateDynamicFieldValue`
   ([dynamic-clinical-ai.service.ts:448](../../backend/src/services/dynamic-clinical-ai.service.ts#L448)) + render em
   [DynamicFieldRenderer.tsx](../../frontend/src/components/consultation/dynamic/DynamicFieldRenderer.tsx) + `FormElementType` em [types/forms.ts](../../frontend/src/types/forms.ts).
2. Campo dentro de um formulário existente é só **editar a definição** no editor e **republicar** (nova versão).
3. `npm run build` no backend e `npm run build`/`npm run lint` no frontend.

## Próximo

→ [06 — Services e lib do backend](06-services-lib.md)
