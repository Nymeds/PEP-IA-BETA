'use client'
import { Consultation } from '@/types'
import { parseJson } from '../../shared/utils'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

const SYSTEMS: { key: string; label: string; items: string[] }[] = [
  { key: 'general', label: 'Geral', items: ['Febre', 'Calafrios', 'Perda de peso', 'Fadiga', 'Astenia'] },
  { key: 'respiratory', label: 'Respiratório', items: ['Tosse', 'Dispneia', 'Sibilos', 'Hemoptise', 'Dor torácica'] },
  { key: 'cardiovascular', label: 'Cardiovascular', items: ['Palpitações', 'Dor precordial', 'Edema', 'Síncope', 'Ortopneia'] },
  { key: 'gastrointestinal', label: 'Gastrointestinal', items: ['Náusea', 'Vômito', 'Dor abdominal', 'Diarreia', 'Constipação', 'Hematêmese'] },
  { key: 'genitourinary', label: 'Geniturinário', items: ['Disúria', 'Polaciúria', 'Hematúria', 'Corrimento', 'Disfunção erétil'] },
  { key: 'neurological', label: 'Neurológico', items: ['Cefaleia', 'Tontura', 'Convulsões', 'Parestesia', 'Déficit motor'] },
  { key: 'psychiatric', label: 'Psiquiátrico', items: ['Ansiedade', 'Depressão', 'Insônia', 'Alterações de humor', 'Alucinações'] },
  { key: 'musculoskeletal', label: 'Musculoesquelético', items: ['Artralgia', 'Mialgia', 'Rigidez articular', 'Limitação de movimento'] },
  { key: 'dermatological', label: 'Dermatológico', items: ['Rash cutâneo', 'Prurido', 'Icterícia', 'Cianose'] },
]

// Normaliza para comparar ignorando acentos e maiúsculas (a IA pode variar a grafia)
const DIACRITICS = /[̀-ͯ]/g
const norm = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()

export function RevisaoSistemasTab({ data, onChange }: Props) {
  const review: Record<string, string[]> = parseJson(data.systemsReview, {})

  const isChecked = (system: string, item: string) =>
    (review[system] || []).some((i) => norm(i) === norm(item))

  const toggle = (system: string, item: string) => {
    const current = review[system] || []
    const has = current.some((i) => norm(i) === norm(item))
    const updated = has
      ? current.filter((i) => norm(i) !== norm(item))
      : [...current, item]
    onChange('systemsReview', JSON.stringify({ ...review, [system]: updated }))
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h2 className="text-base font-semibold text-slate-800">Revisão de Sistemas</h2>
      <p className="text-xs text-slate-500">Marque os sintomas presentes relatados pelo paciente</p>

      <div className="space-y-4">
        {SYSTEMS.map(({ key, label, items }) => {
          const selected = review[key] || []
          return (
            <div key={key} className="card p-4">
              <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3">
                {label}
                {selected.length > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full bg-primary-100 text-primary-700 text-[10px] normal-case">
                    {selected.length} marcado(s)
                  </span>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => {
                  const checked = isChecked(key, item)
                  return (
                    <button
                      key={item}
                      onClick={() => toggle(key, item)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        checked
                          ? 'bg-primary-100 text-primary-700 border border-primary-200'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
