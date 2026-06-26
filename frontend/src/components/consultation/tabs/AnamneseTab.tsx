'use client'
import { Consultation } from '@/types'
import { parseJson } from '../../shared/utils'
import { Sparkles } from 'lucide-react'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

export function AnamneseTab({ data, onChange }: Props) {
  const symptoms: string[] = parseJson(data.symptoms, [])

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-base font-semibold text-slate-800">Anamnese</h2>
        {data.chiefComplaint && (
          <span className="ai-badge">
            <Sparkles className="w-3 h-3" /> Preenchido pela IA
          </span>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Queixa Principal</h3>
        <div>
          <label className="form-label">Motivo da consulta</label>
          <input
            value={data.chiefComplaint || ''}
            onChange={(e) => onChange('chiefComplaint', e.target.value)}
            placeholder="Ex: Febre e dor de garganta há 4 dias"
            className="form-input"
          />
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">História da Doença Atual (HDA)</h3>

        <div>
          <label className="form-label">Descrição cronológica</label>
          <textarea
            value={data.hda || ''}
            onChange={(e) => onChange('hda', e.target.value)}
            rows={4}
            placeholder="Descreva a evolução dos sintomas..."
            className="form-textarea"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Início dos sintomas</label>
            <input
              value={data.symptomStart || ''}
              onChange={(e) => onChange('symptomStart', e.target.value)}
              placeholder="Ex: Há 4 dias, desde segunda-feira"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Intensidade (0–10)</label>
            <input
              value={data.symptomIntensity || ''}
              onChange={(e) => onChange('symptomIntensity', e.target.value)}
              placeholder="Ex: 7/10 ou dor intensa"
              className="form-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Fatores de melhora</label>
            <input
              value={data.improvingFactors || ''}
              onChange={(e) => onChange('improvingFactors', e.target.value)}
              placeholder="Ex: Repouso, analgésicos"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Fatores de piora</label>
            <input
              value={data.worseningFactors || ''}
              onChange={(e) => onChange('worseningFactors', e.target.value)}
              placeholder="Ex: Esforço físico, deitar"
              className="form-input"
            />
          </div>
        </div>

        <div>
          <label className="form-label">Sintomas associados</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {symptoms.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs border border-blue-100"
              >
                {s}
                <button
                  onClick={() => {
                    const updated = symptoms.filter((_, idx) => idx !== i)
                    onChange('symptoms', JSON.stringify(updated))
                  }}
                  className="text-blue-400 hover:text-blue-700 ml-0.5 text-xs"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            placeholder="Digite um sintoma e pressione Enter"
            className="form-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onChange('symptoms', JSON.stringify([...symptoms, e.currentTarget.value.trim()]))
                e.currentTarget.value = ''
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}
