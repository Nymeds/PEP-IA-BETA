'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  CheckCircle2,
  Clock3,
  Copy,
  FileClock,
  FilePlus2,
  Files,
  MoreHorizontal,
  Pencil,
  Plus,
  Rocket,
  Star,
  Wrench,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/AsyncState'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { cn } from '@/components/shared/utils'
import { FormsApiError, formsApi } from '@/services/forms-api'
import type {
  ClinicalFormTemplate,
  FormTemplateStatus,
} from '@/types/forms'

type FilterStatus = FormTemplateStatus | 'all'
type NameDialog = { mode: 'create' } | { mode: 'rename'; template: ClinicalFormTemplate }

const FILTERS: { id: FilterStatus; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'rascunho', label: 'Rascunhos' },
  { id: 'publicado', label: 'Publicados' },
  { id: 'arquivado', label: 'Arquivados' },
]

const STATUS_LABEL: Record<FormTemplateStatus, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  arquivado: 'Arquivado',
}

const STATUS_STYLE: Record<FormTemplateStatus, string> = {
  rascunho: 'border-amber-200 bg-amber-50 text-amber-700',
  publicado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  arquivado: 'border-slate-200 bg-slate-100 text-slate-600',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function VersionsDialog({ template, onClose }: { template: ClinicalFormTemplate; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const versionsQuery = useQuery({
    queryKey: ['form-template-versions', template.id],
    queryFn: () => formsApi.versions(template.id),
  })

  useEffect(() => {
    closeRef.current?.focus()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="versions-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="versions-title" className="font-semibold text-slate-950">Histórico de versões</h2>
            <p className="mt-1 text-xs text-slate-500">{template.name}</p>
          </div>
          <Button ref={closeRef} size="icon" variant="ghost" onClick={onClose} aria-label="Fechar histórico">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {versionsQuery.isLoading ? <LoadingState label="Carregando versões..." /> : null}
          {versionsQuery.isError ? (
            <ErrorState
              message={versionsQuery.error.message}
              requestId={versionsQuery.error instanceof FormsApiError ? versionsQuery.error.requestId : undefined}
              onRetry={() => void versionsQuery.refetch()}
            />
          ) : null}
          {versionsQuery.data?.items.length === 0 ? (
            <EmptyState title="Nenhuma versão publicada" description="Publique o primeiro rascunho para iniciar o histórico imutável." />
          ) : null}
          <ol className="space-y-2">
            {versionsQuery.data?.items.map((version) => (
              <li key={version.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <FileClock className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Versão {version.version}</p>
                  <p className="text-xs text-slate-500">Publicada em {formatDate(version.publishedAt)}</p>
                </div>
                {template.latestVersion?.id === version.id ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">Atual</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

function NameDialog({
  dialog,
  busy,
  onClose,
  onSubmit,
}: {
  dialog: NameDialog
  busy: boolean
  onClose: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(dialog.mode === 'rename' ? dialog.template.name : 'Meu prontuário de Psicologia')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [busy, onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={() => !busy && onClose()}>
      <form
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <h2 id="name-dialog-title" className="text-base font-semibold text-slate-950">
          {dialog.mode === 'create' ? 'Novo formulário' : 'Renomear formulário'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {dialog.mode === 'create'
            ? 'O novo formulário será criado como rascunho para Psicologia.'
            : 'O histórico publicado continuará preservado.'}
        </p>
        <label className="mt-5 block">
          <span className="form-label">Nome</span>
          <input
            ref={inputRef}
            className="form-input"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Salvando...' : dialog.mode === 'create' ? 'Criar e editar' : 'Salvar nome'}
          </Button>
        </div>
      </form>
    </div>
  )
}

export function FormTemplatesManager() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { confirm, notify } = useFeedback()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [versionsTemplate, setVersionsTemplate] = useState<ClinicalFormTemplate | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const templatesQuery = useQuery({
    queryKey: ['form-templates'],
    queryFn: () => formsApi.list(),
  })

  const templates = useMemo(() => templatesQuery.data?.items || [], [templatesQuery.data?.items])
  const visibleTemplates = useMemo(
    () => filter === 'all' ? templates : templates.filter((template) => template.status === filter),
    [filter, templates]
  )

  const counts = useMemo(() => ({
    all: templates.length,
    rascunho: templates.filter((item) => item.status === 'rascunho').length,
    publicado: templates.filter((item) => item.status === 'publicado').length,
    arquivado: templates.filter((item) => item.status === 'arquivado').length,
  }), [templates])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['form-templates'] })
  }

  const createMutation = useMutation({
    mutationFn: (name: string) => formsApi.create({ name, specialtyCode: 'psicologia' }),
    onSuccess: ({ template }) => {
      setNameDialog(null)
      notify('success', 'Rascunho criado', 'Personalize os campos e publique quando estiver pronto.')
      router.push(`/formularios/${template.id}`)
      void refresh()
    },
    onError: (error) => notify('error', 'Não foi possível criar o formulário', error.message),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => formsApi.update(id, { name }),
    onSuccess: async () => {
      setNameDialog(null)
      await refresh()
      notify('success', 'Formulário renomeado')
    },
    onError: (error) => notify('error', 'Não foi possível renomear', error.message),
  })

  const commandMutation = useMutation({
    mutationFn: async ({ action, template }: { action: 'copy' | 'publish' | 'default' | 'archive'; template: ClinicalFormTemplate }) => {
      if (action === 'copy') return formsApi.copy(template.id, `Cópia de ${template.name}`)
      if (action === 'publish') return formsApi.publish(template.id)
      if (action === 'default') return formsApi.setDefault(template.id)
      return formsApi.archive(template.id)
    },
    onSuccess: async ({ template }, variables) => {
      setOpenMenuId(null)
      await refresh()
      const messages = {
        copy: 'Cópia criada',
        publish: 'Nova versão publicada',
        default: 'Formulário definido como padrão',
        archive: 'Formulário arquivado',
      }
      notify('success', messages[variables.action])
      if (variables.action === 'copy') router.push(`/formularios/${template.id}`)
    },
    onError: (error) => notify('error', 'Não foi possível concluir a ação', error.message),
  })

  const runCommand = async (
    action: 'copy' | 'publish' | 'default' | 'archive',
    template: ClinicalFormTemplate
  ) => {
    if (action === 'archive') {
      const accepted = await confirm({
        title: 'Arquivar formulário?',
        description: 'Ele deixará de aparecer para novos agendamentos. Consultas já vinculadas não serão alteradas.',
        confirmLabel: 'Arquivar',
        danger: true,
      })
      if (!accepted) return
    }
    if (action === 'publish') {
      const accepted = await confirm({
        title: 'Publicar nova versão?',
        description: 'A versão ficará imutável e poderá ser usada em novos agendamentos. O rascunho continuará editável.',
        confirmLabel: 'Publicar',
      })
      if (!accepted) return
    }
    commandMutation.mutate({ action, template })
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {nameDialog ? (
        <NameDialog
          dialog={nameDialog}
          busy={createMutation.isPending || renameMutation.isPending}
          onClose={() => setNameDialog(null)}
          onSubmit={(name) => {
            if (nameDialog.mode === 'create') createMutation.mutate(name)
            else renameMutation.mutate({ id: nameDialog.template.id, name })
          }}
        />
      ) : null}
      {versionsTemplate ? <VersionsDialog template={versionsTemplate} onClose={() => setVersionsTemplate(null)} /> : null}

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-600">
            <Wrench className="h-4 w-4" aria-hidden="true" />
            Meu formulário
          </div>
          <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">Prontuários de Psicologia</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Organize campos, permissões da IA e documentos clínicos. Agendamentos usam sempre uma versão publicada.
          </p>
        </div>
        <Button variant="primary" onClick={() => setNameDialog({ mode: 'create' })}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo formulário
        </Button>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="Resumo dos formulários">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700"><Pencil className="h-4 w-4" /></div>
            <div><p className="text-2xl font-semibold text-slate-950">{counts.rascunho}</p><p className="text-xs text-slate-500">Rascunhos</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></div>
            <div><p className="text-2xl font-semibold text-slate-950">{counts.publicado}</p><p className="text-xs text-slate-500">Publicados</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-50 p-2 text-primary-700"><Star className="h-4 w-4" /></div>
            <div><p className="truncate text-sm font-semibold text-slate-950">{templates.find((item) => item.isDefault)?.name || 'Não definido'}</p><p className="text-xs text-slate-500">Padrão para Psicologia</p></div>
          </div>
        </div>
      </section>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1" role="tablist" aria-label="Filtrar formulários">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={cn(
              'min-h-9 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
              filter === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {item.label} <span className={cn('ml-1 text-xs', filter === item.id ? 'text-slate-300' : 'text-slate-400')}>{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <section className="mt-4" aria-live="polite">
        {templatesQuery.isLoading ? <div className="card"><LoadingState label="Carregando formulários..." /></div> : null}
        {templatesQuery.isError ? (
          <div className="card">
            <ErrorState
              message={templatesQuery.error.message}
              requestId={templatesQuery.error instanceof FormsApiError ? templatesQuery.error.requestId : undefined}
              onRetry={() => void templatesQuery.refetch()}
            />
          </div>
        ) : null}
        {!templatesQuery.isLoading && !templatesQuery.isError && !visibleTemplates.length ? (
          <div className="card">
            <EmptyState
              title={filter === 'all' ? 'Nenhum formulário encontrado' : `Nenhum formulário em “${FILTERS.find((item) => item.id === filter)?.label}”`}
              description="Crie um rascunho a partir do modelo de Psicologia e personalize-o no canvas."
              action={<Button variant="primary" onClick={() => setNameDialog({ mode: 'create' })}><FilePlus2 className="h-4 w-4" />Novo formulário</Button>}
            />
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visibleTemplates.map((template) => (
            <article key={template.id} className="relative flex min-h-64 flex-col overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                    <Files className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', STATUS_STYLE[template.status])}>{STATUS_LABEL[template.status]}</span>
                      {template.isDefault ? <span className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700"><Star className="h-3 w-3" />Padrão</span> : null}
                    </div>
                    <h2 className="mt-2 truncate text-base font-semibold text-slate-950" title={template.name}>{template.name}</h2>
                    <p className="mt-0.5 text-xs capitalize text-slate-500">{template.specialtyCode}</p>
                  </div>
                </div>

                <div className="relative">
                  <Button size="icon" variant="ghost" aria-label={`Ações de ${template.name}`} aria-expanded={openMenuId === template.id} onClick={() => setOpenMenuId((value) => value === template.id ? null : template.id)}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  {openMenuId === template.id ? (
                    <div className="absolute right-0 top-10 z-20 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-xl" role="menu">
                      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" role="menuitem" onClick={() => setNameDialog({ mode: 'rename', template })}><Pencil className="h-4 w-4" />Renomear</button>
                      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" role="menuitem" onClick={() => void runCommand('copy', template)}><Copy className="h-4 w-4" />Criar cópia</button>
                      <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" role="menuitem" onClick={() => { setOpenMenuId(null); setVersionsTemplate(template) }}><FileClock className="h-4 w-4" />Ver versões</button>
                      {template.status === 'publicado' && !template.isDefault ? <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-100" role="menuitem" onClick={() => void runCommand('default', template)}><Star className="h-4 w-4" />Definir como padrão</button> : null}
                      {template.status !== 'arquivado' ? <button className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50" role="menuitem" onClick={() => void runCommand('archive', template)}><Archive className="h-4 w-4" />Arquivar</button> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mx-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                <div>
                  <p className="text-slate-400">Versão publicada</p>
                  <p className="mt-1 font-semibold text-slate-800">{template.latestVersion ? `v${template.latestVersion.version}` : 'Nenhuma'}</p>
                </div>
                <div>
                  <p className="text-slate-400">Última edição</p>
                  <p className="mt-1 font-semibold text-slate-800">{formatDate(template.updatedAt)}</p>
                </div>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-slate-100 p-4">
                {template.status !== 'arquivado' ? (
                  <Link href={`/formularios/${template.id}`} className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-primary-600 bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700">
                    <Pencil className="h-4 w-4" />Editar
                  </Link>
                ) : null}
                {template.status !== 'arquivado' ? (
                  <Button className="flex-1" onClick={() => void runCommand('publish', template)} disabled={commandMutation.isPending}>
                    <Rocket className="h-4 w-4" />Publicar
                  </Button>
                ) : (
                  <Button className="flex-1" onClick={() => setVersionsTemplate(template)}><Clock3 className="h-4 w-4" />Versões</Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
