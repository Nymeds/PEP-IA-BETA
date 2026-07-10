'use client'

import { Consultation } from '@/types'
import { Sparkles, X } from 'lucide-react'
import { parseJson } from '../../shared/utils'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

export function AnamneseTab({ data, onChange }: Props) {
  const symptoms: string[] = parseJson(data.symptoms, [])

  return (
    <div className="space-y-5 animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Anamnese</h2>
          <p className="mt-1 text-sm text-slate-500">Queixa principal, HDA e sintomas associados.</p>
        </div>
        {data.chiefComplaint ? (
          <span className="ai-badge">
            <Sparkles className="h-3 w-3" />
            Preenchido pela IA
          </span>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Dados da queixa</h3>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <label className="form-label">Motivo da consulta</label>
            <input
              value={data.chiefComplaint || ''}
              onChange={(event) => onChange('chiefComplaint', event.target.value)}
              placeholder="Ex.: febre e dor de garganta há 4 dias"
              className="form-input"
            />
          </div>

          <div>
            <label className="form-label">Descrição cronológica</label>
            <textarea
              value={data.hda || ''}
              onChange={(event) => onChange('hda', event.target.value)}
              rows={5}
              placeholder="Descreva a evolução dos sintomas."
              className="form-textarea"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="form-label">Início dos sintomas</label>
              <input
                value={data.symptomStart || ''}
                onChange={(event) => onChange('symptomStart', event.target.value)}
                placeholder="Ex.: há 4 dias, desde segunda-feira"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Intensidade (0-10)</label>
              <input
                value={data.symptomIntensity || ''}
                onChange={(event) => onChange('symptomIntensity', event.target.value)}
                placeholder="Ex.: 7/10 ou dor intensa"
                className="form-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="form-label">Fatores de melhora</label>
              <input
                value={data.improvingFactors || ''}
                onChange={(event) => onChange('improvingFactors', event.target.value)}
                placeholder="Ex.: repouso, analgésicos"
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">Fatores de piora</label>
              <input
                value={data.worseningFactors || ''}
                onChange={(event) => onChange('worseningFactors', event.target.value)}
                placeholder="Ex.: esforço físico, deitar"
                className="form-input"
              />
            </div>
          </div>

          <div>
            <label className="form-label">Sintomas associados</label>
            {symptoms.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {symptoms.map((symptom, index) => (
                  <span
                    key={`${symptom}-${index}`}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                  >
                    {symptom}
                    <button
                      type="button"
                      onClick={() => {
                        const updated = symptoms.filter((_, itemIndex) => itemIndex !== index)
                        onChange('symptoms', JSON.stringify(updated))
                      }}
                      className="ml-0.5 text-blue-400 hover:text-blue-700"
                      aria-label={`Remover ${symptom}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              placeholder="Digite um sintoma e pressione Enter"
              className="form-input"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.currentTarget.value.trim()) {
                  event.preventDefault()
                  onChange('symptoms', JSON.stringify([...symptoms, event.currentTarget.value.trim()]))
                  event.currentTarget.value = ''
                }
              }}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
