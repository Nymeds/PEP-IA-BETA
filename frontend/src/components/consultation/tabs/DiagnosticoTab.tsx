'use client'
import { Consultation, CidEntry } from '@/types'
import { parseJson } from '../../shared/utils'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

export function DiagnosticoTab({ data, onChange }: Props) {
  const differentials: string[] = parseJson(data.differentials, [])
  const cids: CidEntry[] = parseJson(data.cid, [])

  const addCid = () => {
    onChange('cid', JSON.stringify([...cids, { code: '', description: '' }]))
  }
  const updateCid = (i: number, field: keyof CidEntry, value: string) => {
    const updated = cids.map((c, idx) => idx === i ? { ...c, [field]: value } : c)
    onChange('cid', JSON.stringify(updated))
  }
  const removeCid = (i: number) => {
    onChange('cid', JSON.stringify(cids.filter((_, idx) => idx !== i)))
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Diagnóstico</h2>

      <div className="card p-5 space-y-4">
        <h3 className="section-title">Hipótese Diagnóstica Principal</h3>
        <textarea
          value={data.mainHypothesis || ''}
          onChange={(e) => onChange('mainHypothesis', e.target.value)}
          rows={3}
          placeholder="Hipótese diagnóstica principal..."
          className="form-textarea"
        />
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Diagnósticos Diferenciais</h3>
        <div className="flex flex-wrap gap-2 mb-2">
          {differentials.map((d, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs border border-amber-100">
              {d}
              <button onClick={() => onChange('differentials', JSON.stringify(differentials.filter((_, idx) => idx !== i)))} className="text-amber-400 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
        <input
          placeholder="Digite um diagnóstico diferencial e pressione Enter"
          className="form-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              onChange('differentials', JSON.stringify([...differentials, e.currentTarget.value.trim()]))
              e.currentTarget.value = ''
            }
          }}
        />
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">Diagnóstico Confirmado</h3>
        <textarea
          value={data.confirmedDiagnosis || ''}
          onChange={(e) => onChange('confirmedDiagnosis', e.target.value)}
          rows={2}
          placeholder="Diagnóstico final confirmado..."
          className="form-textarea"
        />
      </div>

      <div className="card p-5 space-y-3">
        <h3 className="section-title">CID-10</h3>
        {cids.map((c, i) => (
          <div key={i} className="flex gap-3 items-center">
            <input
              value={c.code}
              onChange={(e) => updateCid(i, 'code', e.target.value)}
              placeholder="J06.9"
              className="form-input w-28 flex-shrink-0"
            />
            <input
              value={c.description}
              onChange={(e) => updateCid(i, 'description', e.target.value)}
              placeholder="Descrição do CID"
              className="form-input flex-1"
            />
            <button onClick={() => removeCid(i)} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button onClick={addCid} className="btn-secondary text-xs gap-2">
          <Plus className="w-3.5 h-3.5" /> Adicionar CID
        </button>
      </div>
    </div>
  )
}
