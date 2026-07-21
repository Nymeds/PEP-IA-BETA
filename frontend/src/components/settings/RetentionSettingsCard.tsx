'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database, Loader2, LockKeyhole, Save, ShieldCheck } from 'lucide-react'
import { api } from '@/services/api'
import { useFeedback } from '@/components/ui/FeedbackProvider'

export function RetentionSettingsCard() {
  const queryClient = useQueryClient()
  const { notify } = useFeedback()
  const query = useQuery({ queryKey: ['retention-policy'], queryFn: api.retention.get })
  const [audioDays, setAudioDays] = useState(1825)
  const [sharedYears, setSharedYears] = useState(20)
  const [restrictedYears, setRestrictedYears] = useState(5)
  const [legalHold, setLegalHold] = useState(false)

  useEffect(() => {
    if (!query.data) return
    setAudioDays(query.data.audioRetentionDays)
    setSharedYears(query.data.sharedRecordRetentionYears)
    setRestrictedYears(query.data.restrictedRecordRetentionYears)
    setLegalHold(query.data.legalHold)
  }, [query.data])

  const save = useMutation({
    mutationFn: () => api.retention.update({
      audioRetentionDays: audioDays,
      sharedRecordRetentionYears: sharedYears,
      restrictedRecordRetentionYears: restrictedYears,
      legalHold,
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(['retention-policy'], data)
      notify('success', 'Política de retenção atualizada')
    },
    onError: (error) => notify(
      'error',
      'Não foi possível salvar a retenção',
      error instanceof Error ? error.message : undefined
    ),
  })

  const minimums = query.data?.minimums || {
    audioRetentionDays: 1825,
    sharedRecordRetentionYears: 20,
    restrictedRecordRetentionYears: 5,
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6" aria-labelledby="retention-title">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Database className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Privacidade e ciclo de vida</p>
              <h2 id="retention-title" className="mt-1 text-xl font-semibold text-slate-950">Retenção documental</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                Os pisos de segurança não podem ser reduzidos. Áudio, prontuário compartilhável e registro
                restrito possuem prazos separados e exclusão auditada.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-primary self-start"
            disabled={save.isPending || query.isLoading}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar política
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <label className="rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-800">
            Áudio da consulta (dias)
            <input
              className="mt-2 w-full rounded-lg border-slate-300"
              type="number"
              min={minimums.audioRetentionDays}
              max={36500}
              value={audioDays}
              onChange={(event) => setAudioDays(Number(event.target.value))}
            />
            <span className="mt-2 block text-xs font-normal text-slate-500">Mínimo do beta: {minimums.audioRetentionDays} dias.</span>
          </label>
          <label className="rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-800">
            Prontuário compartilhável (anos)
            <input
              className="mt-2 w-full rounded-lg border-slate-300"
              type="number"
              min={minimums.sharedRecordRetentionYears}
              max={100}
              value={sharedYears}
              onChange={(event) => setSharedYears(Number(event.target.value))}
            />
            <span className="mt-2 block text-xs font-normal text-slate-500">Mínimo: {minimums.sharedRecordRetentionYears} anos.</span>
          </label>
          <label className="rounded-xl border border-slate-200 p-4 text-sm font-medium text-slate-800">
            Registro psicológico restrito (anos)
            <input
              className="mt-2 w-full rounded-lg border-slate-300"
              type="number"
              min={minimums.restrictedRecordRetentionYears}
              max={100}
              value={restrictedYears}
              onChange={(event) => setRestrictedYears(Number(event.target.value))}
            />
            <span className="mt-2 block text-xs font-normal text-slate-500">Mínimo: {minimums.restrictedRecordRetentionYears} anos.</span>
          </label>
        </div>

        <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-amber-400 text-amber-700"
            checked={legalHold}
            onChange={(event) => setLegalHold(event.target.checked)}
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              {legalHold ? <LockKeyhole className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              Bloqueio legal
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-amber-900">
              Suspende exclusões por vencimento. A ativação não compartilha dados nem executa qualquer comunicação externa.
            </span>
          </span>
        </label>
      </div>
    </section>
  )
}
