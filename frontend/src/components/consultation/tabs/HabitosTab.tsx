'use client'
import { Consultation } from '@/types'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

const Field = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) => (
  <div>
    <label className="form-label">{label}</label>
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="form-input" />
  </div>
)

export function HabitosTab({ data, onChange }: Props) {
  const f = (field: keyof Consultation) => (v: string) => onChange(field, v)

  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Hábitos de Vida</h2>

      <div className="card p-5">
        <h3 className="section-title">Substâncias e Vícios</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Tabagismo</label>
            <select
              value={data.smoking || ''}
              onChange={(e) => onChange('smoking', e.target.value)}
              className="form-input"
            >
              <option value="">Selecionar</option>
              <option value="Não fumante">Não fumante</option>
              <option value="Fumante">Fumante</option>
              <option value="Ex-fumante">Ex-fumante</option>
            </select>
          </div>
          <div>
            <label className="form-label">Etilismo</label>
            <select
              value={data.alcohol || ''}
              onChange={(e) => onChange('alcohol', e.target.value)}
              className="form-input"
            >
              <option value="">Selecionar</option>
              <option value="Não bebe">Não bebe</option>
              <option value="Uso social">Uso social (ocasional)</option>
              <option value="Uso frequente">Uso frequente</option>
              <option value="Uso abusivo">Uso abusivo</option>
            </select>
          </div>
          <div>
            <label className="form-label">Uso de drogas ilícitas</label>
            <input
              value={data.drugs || ''}
              onChange={(e) => onChange('drugs', e.target.value)}
              placeholder="Tipo, frequência"
              className="form-input"
            />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="section-title">Estilo de Vida</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Atividade física" value={data.physicalActivity || ''} onChange={f('physicalActivity')} placeholder="Tipo e frequência (ex: caminhada 3x/semana)" />
          <Field label="Qualidade do sono" value={data.sleep || ''} onChange={f('sleep')} placeholder="Horas por noite, qualidade" />
          <Field label="Alimentação" value={data.diet || ''} onChange={f('diet')} placeholder="Hábitos alimentares gerais" />
          <Field label="Ocupação / Profissão" value={data.occupation || ''} onChange={f('occupation')} placeholder="Profissão e condições de trabalho" />
        </div>
      </div>
    </div>
  )
}
