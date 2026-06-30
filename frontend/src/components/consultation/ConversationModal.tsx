'use client'

import { useState, type ElementType } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Consultation, ConversationTopic } from '@/types'
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
      <mark key={index} className="bg-amber-200 text-slate-900 rounded px-0.5">
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
        editReason || 'Edicao manual da transcricao',
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
    { id: 'raw', label: 'Transcricao', icon: Search },
    { id: 'topics', label: 'Topicos da IA', icon: ListTree },
    { id: 'audio', label: 'Audio', icon: Volume2 },
    { id: 'edit', label: 'Editar / Versoes', icon: FileEdit },
  ]

  const rawTranscriptText = rawTranscriptQuery.data?.rawTranscript || consultation.transcript || ''
  const occurrences = search
    ? Math.max(0, rawTranscriptText.toLowerCase().split(search.toLowerCase()).length - 1)
    : 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-3xl h-[80vh] flex flex-col animate-slide-up"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary-600" />
            <h3 className="text-sm font-semibold text-slate-800">Historico da Conversa</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 px-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'raw' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar e destacar palavras na conversa..."
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  {search && <span className="text-xs text-slate-400">{occurrences} ocorrencia(s)</span>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {rawTranscriptQuery.isLoading ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 py-10">
                    <Loader2 className="w-5 h-5 animate-spin" /> Carregando transcricao bruta...
                  </div>
                ) : rawTranscriptText ? (
                  <div className="space-y-3">
                    {rawTranscriptQuery.data ? (
                      <div className="flex items-center justify-between gap-4 text-[11px] text-slate-400">
                        <span>
                          {rawTranscriptQuery.data.segmentCount
                            ? `${rawTranscriptQuery.data.segmentCount} segmento(s) brutos preservados`
                            : 'Transcricao recuperada do historico existente'}
                        </span>
                        {rawTranscriptQuery.data.hasEditedTranscript ? (
                          <span>Versao editavel separada da transcricao original</span>
                        ) : null}
                      </div>
                    ) : null}

                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {highlight(rawTranscriptText, search)}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Nenhuma transcricao registrada</p>
                )}
              </div>
            </div>
          )}

          {tab === 'topics' && (
            <div className="flex-1 overflow-y-auto p-5">
              {topicsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-400 py-10">
                  <Loader2 className="w-5 h-5 animate-spin" /> A IA esta identificando os topicos...
                </div>
              ) : !topicsQuery.data?.topics.length ? (
                <p className="text-sm text-slate-400 text-center py-10">Nenhum topico identificado</p>
              ) : (
                <div className="space-y-3">
                  {topicsQuery.data.topics.map((topic: ConversationTopic, index) => (
                    <div key={index} className="card p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                        <h4 className="text-sm font-semibold text-slate-800">{topic.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{topic.summary}</p>
                      <div className="space-y-1.5">
                        {topic.excerpts.map((excerpt, excerptIndex) => (
                          <p
                            key={excerptIndex}
                            className="text-xs text-slate-600 bg-slate-50 rounded px-3 py-1.5 border-l-2 border-primary-200"
                          >
                            "{excerpt}"
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'audio' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
              {consultation.audioPath ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
                    <Volume2 className="w-7 h-7 text-primary-600" />
                  </div>
                  <p className="text-sm text-slate-600">Gravacao da consulta</p>
                  <audio controls src={api.consultations.audioUrl(consultation.id)} className="w-full max-w-md">
                    Seu navegador nao suporta audio.
                  </audio>
                  <a
                    href={api.consultations.audioUrl(consultation.id)}
                    download
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Baixar audio
                  </a>
                </>
              ) : (
                <p className="text-sm text-slate-400">Nenhum audio gravado para esta consulta</p>
              )}
            </div>
          )}

          {tab === 'edit' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  Ao editar a transcricao e salvar, o PEP e recalculado pela IA e o estado anterior e
                  preservado como uma <strong>nova versao</strong>.
                </p>
                {rawTranscriptQuery.data?.segmentCount ? (
                  <p className="text-xs text-amber-700 mt-2">
                    A transcricao bruta do atendimento permanece preservada em separado para auditoria e revisao.
                  </p>
                ) : null}
              </div>

              <div>
                <label className="form-label">Transcricao editavel</label>
                <textarea
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  rows={8}
                  className="form-textarea font-mono text-xs"
                />
              </div>

              <div>
                <label className="form-label">Motivo da correcao (opcional)</label>
                <input
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder="Ex: paciente tambem relatou nauseas"
                  className="form-input"
                />
              </div>

              <button
                onClick={() => createVersion.mutate()}
                disabled={createVersion.isPending || editText === consultation.transcript}
                className="btn-primary"
              >
                {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {createVersion.isPending ? 'Recalculando PEP...' : 'Salvar como nova versao'}
              </button>

              <div className="pt-2">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Versoes anteriores ({versionsQuery.data?.length || 0})
                </h4>

                {!versionsQuery.data?.length ? (
                  <p className="text-xs text-slate-400">Nenhuma versao anterior; esta e a versao original.</p>
                ) : (
                  <div className="space-y-2">
                    {versionsQuery.data.map((version) => (
                      <div key={version.id} className="card p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">Versao {version.version}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(version.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {version.reason ? <p className="text-xs text-slate-500">{version.reason}</p> : null}
                        {version.transcript ? (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{version.transcript}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
