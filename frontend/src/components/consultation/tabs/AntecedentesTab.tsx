'use client'
import { Consultation, Medication, AllergyDetail, FamilyHistory } from '@/types'
import { parseJson } from '../../shared/utils'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

const FAMILY_LABELS: { key: keyof FamilyHistory; label: string }[] = [
  { key: 'diabetes', label: 'Diabetes' },
  { key: 'hypertension', label: 'Hipertensão' },
  { key: 'stroke', label: 'AVC' },
  { key: 'cancer', label: 'Câncer' },
  { key: 'heartDisease', label: 'Cardiopatia' },
]

export function AntecedentesTab({ data, onChange }: Props) {
  const previousDiseases: string[] = parseJson(data.previousDiseases, [])
  const surgeries: string[] = parseJson(data.surgeries, [])
  const hospitalizations: string[] = parseJson(data.hospitalizations, [])
  const allergies: AllergyDetail[] = parseJson(data.allergiesDetails, [])
  const medications: Medication[] = parseJson(data.currentMedications, [])
  const family: FamilyHistory = parseJson(data.familyHistory, {})

  const addMed = () => {
    onChange('currentMedications', JSON.stringify([...medications, { name: '', dose: '', frequency: '', route: '' }]))
  }
  const updateMed = (i: number, field: keyof Medication, value: string) => {
    const updated = medications.map((m, idx) => idx === i ? { ...m, [field]: value } : m)
    onChange('currentMedications', JSON.stringify(updated))
  }
  const removeMed = (i: number) => {
    onChange('currentMedications', JSON.stringify(medications.filter((_, idx) => idx !== i)))
  }

  const addAllergy = () => {
    onChange('allergiesDetails', JSON.stringify([...allergies, { substance: '', reaction: '' }]))
  }
  const updateAllergy = (i: number, field: keyof AllergyDetail, value: string) => {
    const updated = allergies.map((a, idx) => idx === i ? { ...a, [field]: value } : a)
    onChange('allergiesDetails', JSON.stringify(updated))
  }
  const removeAllergy = (i: number) => {
    onChange('allergiesDetails', JSON.stringify(allergies.filter((_, idx) => idx !== i)))
  }

  const toggleFamily = (key: keyof FamilyHistory) => {
    onChange('familyHistory', JSON.stringify({ ...family, [key]: !family[key] }))
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Antecedentes Pessoais e Familiares</h2>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Doenças Prévias</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          {previousDiseases.map((d, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
              {d}
              <button onClick={() => onChange('previousDiseases', JSON.stringify(previousDiseases.filter((_, idx) => idx !== i)))} className="text-slate-400 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
        <input
          placeholder="Digite uma doença e pressione Enter (ex: Hipertensão, Diabetes tipo 2)"
          className="form-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              onChange('previousDiseases', JSON.stringify([...previousDiseases, e.currentTarget.value.trim()]))
              e.currentTarget.value = ''
            }
          }}
        />
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Alergias</h3>
        {allergies.map((a, i) => (
          <div key={i} className="flex gap-3 items-center">
            <input value={a.substance} onChange={(e) => updateAllergy(i, 'substance', e.target.value)} placeholder="Substância" className="form-input flex-1" />
            <input value={a.reaction} onChange={(e) => updateAllergy(i, 'reaction', e.target.value)} placeholder="Tipo de reação" className="form-input flex-1" />
            <button onClick={() => removeAllergy(i)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button onClick={addAllergy} className="btn-secondary text-xs gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Alergia
        </button>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Medicamentos em Uso</h3>
        {medications.map((m, i) => (
          <div key={i} className="grid grid-cols-4 gap-2 items-center">
            <input value={m.name} onChange={(e) => updateMed(i, 'name', e.target.value)} placeholder="Medicamento" className="form-input col-span-1" />
            <input value={m.dose} onChange={(e) => updateMed(i, 'dose', e.target.value)} placeholder="Dose" className="form-input" />
            <input value={m.frequency} onChange={(e) => updateMed(i, 'frequency', e.target.value)} placeholder="Frequência" className="form-input" />
            <div className="flex gap-2">
              <input value={m.route} onChange={(e) => updateMed(i, 'route', e.target.value)} placeholder="Via" className="form-input flex-1" />
              <button onClick={() => removeMed(i)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        <button onClick={addMed} className="btn-secondary text-xs gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar Medicamento
        </button>
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Cirurgias e Internações</h3>
        <div>
          <label className="form-label">Cirurgias anteriores</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {surgeries.map((s, i) => (
              <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
                {s} <button onClick={() => onChange('surgeries', JSON.stringify(surgeries.filter((_, idx) => idx !== i)))} className="text-slate-400 hover:text-red-500">×</button>
              </span>
            ))}
          </div>
          <input placeholder="Digite e pressione Enter" className="form-input" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { onChange('surgeries', JSON.stringify([...surgeries, e.currentTarget.value.trim()])); e.currentTarget.value = '' } }} />
        </div>
        <div>
          <label className="form-label">Internações anteriores</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {hospitalizations.map((h, i) => (
              <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
                {h} <button onClick={() => onChange('hospitalizations', JSON.stringify(hospitalizations.filter((_, idx) => idx !== i)))} className="text-slate-400 hover:text-red-500">×</button>
              </span>
            ))}
          </div>
          <input placeholder="Digite e pressione Enter" className="form-input" onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { onChange('hospitalizations', JSON.stringify([...hospitalizations, e.currentTarget.value.trim()])); e.currentTarget.value = '' } }} />
        </div>
      </div>

      <div className="card p-5">
        <h3 className="section-title">Antecedentes Familiares</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {FAMILY_LABELS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={!!family[key]}
                onChange={() => toggleFamily(key)}
                className="w-4 h-4 rounded text-primary-600 border-slate-300"
              />
              <span className="text-sm text-slate-700 group-hover:text-slate-900">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
