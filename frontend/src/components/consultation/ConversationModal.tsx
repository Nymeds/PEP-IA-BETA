'use client'

import { useState, type ElementType } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  FileEdit,
  History,
  ListTree,
  Loader2,
  Save,
  Search,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react'
import { api } from '@/services/api'
import { Consultation, ConversationTopic } from '@/types'
import { cn } from '../shared/utils'

type Tab = 'raw' | 'topics' | 'audio' | 'edit'

interface Props {
  consultation: Consultation
  onClose: () => void
  onVersionCreated: (updated: Consultation) => void
}

function highlight(text: string, term: string) {
  if (!term.trim()) return text
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${safe})`, 'gi'))
  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={index} className="rounded bg-amber-200 px-0.5 text-slate-900">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    )
  )
}

export function ConversationModal({ consultation, onClose, onVersionCreated }: Props) {
  const [tab, setTab] = useState<Tab>('raw')
  const [search, setSearch] = useState('')
  const [editText, setEditText] = useState(consultation.transcript || '')
  const [editReason, setEditReason] = useState('')

  const rawTranscriptQuery = useQuery({
    queryKey: ['raw-transcript', consultation.id],
    queryFn: () => api.consultations.rawTranscript(consultation.id),
  })

  const topicsQuery = useQuery({
    queryKey: ['topics', consultation.id],
    queryFn: () => api.consultations.topics(consultation.id),
    enabled: tab === 'topics',
  })

  const versionsQuery = useQuery({
    queryKey: ['versions', consultation.id],
    queryFn: () => api.consultations.listVersions(consultation.id),
    enabled: tab === 'edit',
  })

  const createVersion = useMutation({
    mutationFn: () =>
      api.consultations.createVersion(
        consultation.id,
        editText,
        editReason || 'Edição manual da transcrição',
        {
          before: consultation.transcript || '',
          after: editText,
        }
      ),
    onSuccess: (response) => {
      onVersionCreated(response.consultation)
      setEditText(response.consultation.transcript || '')
      setEditReason('')
      void versionsQuery.refetch()
    },
  })

  const tabs: Array<{ id: Tab; label: string; icon: ElementType }> = [
    { id: 'raw', label: 'Transcrição', icon: Search },
    { id: 'topics', label: 'Tópicos da IA', icon: ListTree },
    { id: 'audio', label: 'Áudio', icon: Volume2 },
    { id: 'edit', label: 'Editar / versões', icon: FileEdit },
  ]

  const rawTranscriptText = rawTranscriptQuery.data?.rawTranscript || consultation.transcript || ''
  const occurrences = search
    ? Math.max(0, rawTranscriptText.toLowerCase().split(search.toLowerCase()).length - 1)
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div
        className="flex h-[84vh] w-full max-w-4xl animate-slide-up flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary-600" />
            <h3 className="text-sm font-semibold text-slate-900">Histórico da conversa</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex overflow-x-auto border-b border-slate-100 px-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-4 py-3 text-xs font-medium transition-colors',
                tab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {tab === 'raw' ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar e destacar palavras na conversa"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  {search ? <span className="text-xs text-slate-400">{occurrences} ocorrência(s)</span> : null}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {rawTranscriptQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Carregando transcrição bruta
                  </div>
                ) : rawTranscriptText ? (
                  <div className="space-y-4">
                    {rawTranscriptQuery.data ? (
                      <div className="grid gap-3 text-xs text-slate-500 md:grid-cols-3">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="font-semibold text-slate-700">{rawTranscriptQuery.data.segmentCount}</p>
                          <p>segmento(s) preservado(s)</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="font-semibold text-slate-700">
                            {rawTranscriptQuery.data.hasEditedTranscript ? 'Sim' : 'Não'}
                          </p>
                          <p>transcrição editada</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <p className="font-semibold text-slate-700">{rawTranscriptText.length}</p>
                          <p>caracteres brutos</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {highlight(rawTranscriptText, search)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm text-slate-400">Nenhuma transcrição registrada.</p>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'topics' ? (
            <div className="flex-1 overflow-y-auto p-5">
              {topicsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  A IA está identificando os tópicos
                </div>
              ) : !topicsQuery.data?.topics.length ? (
                <p className="py-10 text-center text-sm text-slate-400">Nenhum tópico identificado.</p>
              ) : (
                <div className="space-y-3">
                  {topicsQuery.data.topics.map((topic: ConversationTopic, index) => (
                    <div key={`${topic.title}-${index}`} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="mb-1 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-primary-500" />
                        <h4 className="text-sm font-semibold text-slate-900">{topic.title}</h4>
                      </div>
                      <p className="mb-2 text-xs leading-relaxed text-slate-500">{topic.summary}</p>
                      <div className="space-y-1.5">
                        {topic.excerpts.map((excerpt, excerptIndex) => (
                          <p
                            key={excerptIndex}
                            className="rounded border-l-2 border-primary-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600"
                          >
                            {excerpt}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'audio' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
              {consultation.audioPath ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
                    <Volume2 className="h-7 w-7 text-primary-600" />
                  </div>
                  <p className="text-sm text-slate-600">Gravação da consulta</p>
                  <audio controls src={api.consultations.audioUrl(consultation.id)} className="w-full max-w-md">
                    Seu navegador não suporta áudio.
                  </audio>
                  <a href={api.consultations.audioUrl(consultation.id)} download className="text-xs text-primary-600 hover:underline">
                    Baixar áudio
                  </a>
                </>
              ) : (
                <p className="text-sm text-slate-400">Nenhum áudio gravado para esta consulta.</p>
              )}
            </div>
          ) : null}

          {tab === 'edit' ? (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="text-xs leading-relaxed text-amber-800">
                      Ao editar a transcrição e salvar, o PEP é recalculado pela IA e o estado anterior
                      é preservado como uma nova versão.
                    </p>
                  </div>

                  <div>
                    <label className="form-label">Transcrição editável</label>
                    <textarea
                      value={editText}
                      onChange={(event) => setEditText(event.target.value)}
                      rows={12}
                      className="form-textarea font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="form-label">Motivo da correção</label>
                    <input
                      value={editReason}
                      onChange={(event) => setEditReason(event.target.value)}
                      placeholder="Ex.: paciente também relatou náuseas"
                      className="form-input"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => createVersion.mutate()}
                    disabled={createVersion.isPending || editText === consultation.transcript}
                    className="btn-primary"
                  >
                    {createVersion.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {createVersion.isPending ? 'Recalculando PEP...' : 'Salvar como nova versão'}
                  </button>
                  {createVersion.isError ? (
                    <p className="text-xs text-red-600">{createVersion.error.message}</p>
                  ) : null}
                </div>

                <aside className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Versões anteriores ({versionsQuery.data?.length || 0})
                  </h4>

                  {versionsQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando versões
                    </div>
                  ) : !versionsQuery.data?.length ? (
                    <p className="text-xs text-slate-400">Nenhuma versão anterior. Esta é a versão original.</p>
                  ) : (
                    <div className="space-y-2">
                      {versionsQuery.data.map((version) => (
                        <div key={version.id} className="rounded-lg border border-slate-200 bg-white p-3">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold text-slate-700">Versão {version.version}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(version.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          {version.reason ? <p className="text-xs text-slate-500">{version.reason}</p> : null}
                          {version.transcript ? (
                            <p className="mt-1 line-clamp-3 text-[11px] text-slate-400">{version.transcript}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </aside>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
