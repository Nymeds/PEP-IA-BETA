'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Consultation, ConversationTopic } from '@/types'
import {
  X, Search, ListTree, Volume2, FileEdit, Sparkles, Loader2, History, Save,
} from 'lucide-react'

type Tab = 'raw' | 'topics' | 'audio' | 'edit'

interface Props {
  consultation: Consultation
  onClose: () => void
  onVersionCreated: (updated: Consultation) => void
}

// Destaca ocorrências do termo de busca no texto
function highlight(text: string, term: string) {
  if (!term.trim()) return text
  const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${safe})`, 'gi'))
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{p}</mark>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

export function ConversationModal({ consultation, onClose, onVersionCreated }: Props) {
  const [tab, setTab] = useState<Tab>('raw')
  const [search, setSearch] = useState('')
  const [editText, setEditText] = useState(consultation.transcript || '')
  const [editReason, setEditReason] = useState('')

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
      api.consultations.createVersion(consultation.id, editText, editReason || 'Edição manual da transcrição', {
        before: consultation.transcript || '',
        after: editText,
      }),
    onSuccess: (res) => {
      onVersionCreated(res.consultation)
      setEditReason('')
      versionsQuery.refetch()
    },
  })

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'raw', label: 'Transcrição', icon: Search },
    { id: 'topics', label: 'Tópicos da IA', icon: ListTree },
    { id: 'audio', label: 'Áudio', icon: Volume2 },
    { id: 'edit', label: 'Editar / Versões', icon: FileEdit },
  ]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="card w-full max-w-3xl h-[80vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary-600" />
            <h3 className="text-sm font-semibold text-slate-800">Histórico da Conversa</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-2">
          {TABS.map(({ id, label, icon: Icon }) => (
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

        {/* Conteúdo */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* ABA: Transcrição bruta + busca */}
          {tab === 'raw' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar e destacar palavras na conversa..."
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  {search && (
                    <span className="text-xs text-slate-400">
                      {(consultation.transcript?.toLowerCase().split(search.toLowerCase()).length || 1) - 1} ocorrência(s)
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {consultation.transcript ? (
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {highlight(consultation.transcript, search)}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-10">Nenhuma transcrição registrada</p>
                )}
              </div>
            </div>
          )}

          {/* ABA: Tópicos da IA */}
          {tab === 'topics' && (
            <div className="flex-1 overflow-y-auto p-5">
              {topicsQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-400 py-10">
                  <Loader2 className="w-5 h-5 animate-spin" /> A IA está identificando os tópicos...
                </div>
              ) : !topicsQuery.data?.topics.length ? (
                <p className="text-sm text-slate-400 text-center py-10">Nenhum tópico identificado</p>
              ) : (
                <div className="space-y-3">
                  {topicsQuery.data.topics.map((t: ConversationTopic, i) => (
                    <div key={i} className="card p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-3.5 h-3.5 text-primary-500" />
                        <h4 className="text-sm font-semibold text-slate-800">{t.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 mb-2">{t.summary}</p>
                      <div className="space-y-1.5">
                        {t.excerpts.map((ex, j) => (
                          <p key={j} className="text-xs text-slate-600 bg-slate-50 rounded px-3 py-1.5 border-l-2 border-primary-200">
                            “{ex}”
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA: Áudio */}
          {tab === 'audio' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
              {consultation.audioPath ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-primary-50 flex items-center justify-center">
                    <Volume2 className="w-7 h-7 text-primary-600" />
                  </div>
                  <p className="text-sm text-slate-600">Gravação da consulta</p>
                  <audio controls src={api.consultations.audioUrl(consultation.id)} className="w-full max-w-md">
                    Seu navegador não suporta áudio.
                  </audio>
                  <a
                    href={api.consultations.audioUrl(consultation.id)}
                    download
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Baixar áudio
                  </a>
                </>
              ) : (
                <p className="text-sm text-slate-400">Nenhum áudio gravado para esta consulta</p>
              )}
            </div>
          )}

          {/* ABA: Editar / Versões */}
          {tab === 'edit' && (
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                <p className="text-xs text-amber-700">
                  Ao editar a transcrição e salvar, o PEP é recalculado pela IA e o estado anterior é
                  preservado como uma <strong>nova versão</strong> (não substitui — mantém rastreabilidade).
                </p>
              </div>

              <div>
                <label className="form-label">Transcrição (editável)</label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={8}
                  className="form-textarea font-mono text-xs"
                />
              </div>
              <div>
                <label className="form-label">Motivo da correção (opcional)</label>
                <input
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ex: paciente também relatou náuseas"
                  className="form-input"
                />
              </div>
              <button
                onClick={() => createVersion.mutate()}
                disabled={createVersion.isPending || editText === consultation.transcript}
                className="btn-primary"
              >
                {createVersion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {createVersion.isPending ? 'Recalculando PEP...' : 'Salvar como nova versão'}
              </button>

              {/* Lista de versões */}
              <div className="pt-2">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                  Versões anteriores ({versionsQuery.data?.length || 0})
                </h4>
                {!versionsQuery.data?.length ? (
                  <p className="text-xs text-slate-400">Nenhuma versão anterior — esta é a versão original.</p>
                ) : (
                  <div className="space-y-2">
                    {versionsQuery.data.map((v) => (
                      <div key={v.id} className="card p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">Versão {v.version}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(v.createdAt).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {v.reason && <p className="text-xs text-slate-500">{v.reason}</p>}
                        {v.transcript && (
                          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{v.transcript}</p>
                        )}
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
