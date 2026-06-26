'use client'
import { Consultation, VitalSigns, PhysicalExam } from '@/types'
import { parseJson } from '../../shared/utils'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

export function ExameFisicoTab({ data, onChange }: Props) {
  const vitals: VitalSigns = parseJson(data.vitalSigns, {})
  const exam: PhysicalExam = parseJson(data.physicalExam, {})

  const updateVital = (key: keyof VitalSigns, value: string) => {
    onChange('vitalSigns', JSON.stringify({ ...vitals, [key]: value }))
  }
  const updateExam = (key: keyof PhysicalExam, value: string) => {
    onChange('physicalExam', JSON.stringify({ ...exam, [key]: value }))
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Exame Físico</h2>

      <div className="card p-5">
        <h3 className="section-title">Sinais Vitais</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { key: 'pa' as const, label: 'P.A.', placeholder: '120/80 mmHg' },
            { key: 'fc' as const, label: 'F.C.', placeholder: '70 bpm' },
            { key: 'fr' as const, label: 'F.R.', placeholder: '16 irpm' },
            { key: 'temp' as const, label: 'Temperatura', placeholder: '36.5 °C' },
            { key: 'spo2' as const, label: 'SpO₂', placeholder: '98%' },
            { key: 'glucose' as const, label: 'Glicemia', placeholder: 'mg/dL' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="form-label">{label}</label>
              <input
                value={vitals[key] || ''}
                onChange={(e) => updateVital(key, e.target.value)}
                placeholder={placeholder}
                className="form-input"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="section-title">Antropometria</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">Peso (kg)</label>
            <input
              type="number"
              value={data.weight || ''}
              onChange={(e) => {
                const w = parseFloat(e.target.value)
                const h = data.height ? data.height / 100 : null
                onChange('weight', w)
                if (h && w) onChange('bmi', parseFloat((w / (h * h)).toFixed(1)))
              }}
              placeholder="70.0"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">Altura (cm)</label>
            <input
              type="number"
              value={data.height || ''}
              onChange={(e) => {
                const h = parseFloat(e.target.value) / 100
                const w = data.weight
                onChange('height', parseFloat(e.target.value))
                if (h && w) onChange('bmi', parseFloat((w / (h * h)).toFixed(1)))
              }}
              placeholder="170"
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">IMC</label>
            <input
              value={data.bmi ? `${data.bmi} kg/m²` : ''}
              readOnly
              placeholder="—"
              className="form-input bg-slate-50 text-slate-500 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="section-title">Estado Geral</h3>
        <div className="flex gap-3">
          {['Bom estado geral', 'Regular estado geral', 'Mau estado geral'].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange('generalState', opt)}
              className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                data.generalState === opt
                  ? 'bg-primary-50 text-primary-700 border-primary-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {opt.replace(' estado geral', '')}
            </button>
          ))}
        </div>
        {data.generalState && (
          <p className="text-xs text-slate-500 mt-2">{data.generalState}</p>
        )}
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Exame Segmentar</h3>
        {[
          { key: 'headNeck' as const, label: 'Cabeça e Pescoço' },
          { key: 'cardioRespiratory' as const, label: 'Cardiorrespiratório' },
          { key: 'abdomen' as const, label: 'Abdome' },
          { key: 'neurological' as const, label: 'Neurológico' },
          { key: 'extremities' as const, label: 'Extremidades' },
        ].map(({ key, label }) => (
          <div key={key}>
            <label className="form-label">{label}</label>
            <textarea
              value={exam[key] || ''}
              onChange={(e) => updateExam(key, e.target.value)}
              rows={2}
              placeholder="Achados do exame..."
              className="form-textarea"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
