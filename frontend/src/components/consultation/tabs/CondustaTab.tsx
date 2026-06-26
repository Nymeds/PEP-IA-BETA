'use client'
import { Consultation } from '@/types'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

export function CondustaTab({ data, onChange }: Props) {
  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Conduta e Plano Terapêutico</h2>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Plano Terapêutico</h3>
        <textarea
          value={data.therapeuticPlan || ''}
          onChange={(e) => onChange('therapeuticPlan', e.target.value)}
          rows={4}
          placeholder="Descreva as condutas e medidas terapêuticas..."
          className="form-textarea"
        />
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Orientações ao Paciente</h3>
        <textarea
          value={data.orientations || ''}
          onChange={(e) => onChange('orientations', e.target.value)}
          rows={3}
          placeholder="Orientações, cuidados em casa, sinais de alarme..."
          className="form-textarea"
        />
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Encaminhamentos</h3>
        <textarea
          value={data.referrals || ''}
          onChange={(e) => onChange('referrals', e.target.value)}
          rows={2}
          placeholder="Especialidades, serviços ou exames solicitados..."
          className="form-textarea"
        />
      </div>

      <div className="card p-5">
        <h3 className="section-title">Data de Retorno</h3>
        <input
          type="date"
          value={data.followUpDate || ''}
          onChange={(e) => onChange('followUpDate', e.target.value)}
          className="form-input w-48"
        />
      </div>
    </div>
  )
}
