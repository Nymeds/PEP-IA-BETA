'use client'
import { Consultation, DialogueTurn } from '@/types'
import { Sparkles, FileText, Stethoscope, User } from 'lucide-react'
import { parseJson } from '../../shared/utils'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

const FIELDS: { key: keyof Consultation; label: string; letter: string; color: string; hint: string }[] = [
  { key: 'subjective', label: 'Subjetivo', letter: 'S', color: 'bg-blue-500', hint: 'O que o paciente relatou: queixas, sintomas, história' },
  { key: 'objective', label: 'Objetivo', letter: 'O', color: 'bg-teal-500', hint: 'Sinais vitais, exame físico, dados mensuráveis' },
  { key: 'assessment', label: 'Avaliação', letter: 'A', color: 'bg-violet-500', hint: 'Hipóteses diagnósticas, raciocínio clínico' },
  { key: 'plan', label: 'Plano', letter: 'P', color: 'bg-amber-500', hint: 'Condutas, prescrições, orientações, retorno' },
]

export function SoapTab({ data, onChange }: Props) {
  const hasSoap = data.subjective || data.objective || data.assessment || data.plan
  const turns: DialogueTurn[] = parseJson(data.transcriptStructured, [])

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-800">Evolução Clínica — SOAP</h2>
        {hasSoap && (
          <span className="ai-badge">
            <Sparkles className="w-3 h-3" /> Gerado pela IA
          </span>
        )}
      </div>

      {!hasSoap && (
        <div className="card p-8 text-center border-dashed">
          <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400 mb-1">O SOAP ainda não foi gerado</p>
          <p className="text-xs text-slate-300">
            Encerre a sessão de gravação e clique em &quot;Gerar SOAP&quot; no cabeçalho
          </p>
        </div>
      )}

      <div className="space-y-4">
        {FIELDS.map(({ key, label, letter, color, hint }) => (
          <div key={key} className="card overflow-hidden">
            <div className={`${color} px-4 py-2.5 flex items-center gap-3`}>
              <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold">
                {letter}
              </span>
              <span className="text-white text-sm font-medium">{label}</span>
              <span className="text-white/60 text-xs ml-auto">{hint}</span>
            </div>
            <div className="p-4">
              <textarea
                value={(data[key] as string) || ''}
                onChange={(e) => onChange(key, e.target.value)}
                rows={4}
                placeholder={`${label}...`}
                className="form-textarea border-0 p-0 focus:ring-0 resize-none text-slate-700"
              />
            </div>
          </div>
        ))}
      </div>

      {turns.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title flex items-center gap-2">
            Diálogo da Consulta
            <span className="ai-badge">
              <Sparkles className="w-3 h-3" /> Falantes identificados pela IA
            </span>
          </h3>
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {turns.map((turn, i) => {
              const isDoctor = turn.speaker === 'Médico'
              const isPatient = turn.speaker === 'Paciente'
              return (
                <div key={i} className={`flex gap-2.5 ${isDoctor ? '' : 'flex-row-reverse'}`}>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isDoctor ? 'bg-primary-100 text-primary-600' : isPatient ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isDoctor ? <Stethoscope className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[80%] ${isDoctor ? 'text-left' : 'text-right'}`}>
                    <p className={`text-[10px] font-medium mb-0.5 ${isDoctor ? 'text-primary-500' : isPatient ? 'text-teal-500' : 'text-slate-400'}`}>
                      {turn.speaker}
                    </p>
                    <p
                      className={`text-xs leading-relaxed inline-block rounded-lg px-3 py-2 ${
                        isDoctor ? 'bg-primary-50 text-slate-700' : isPatient ? 'bg-teal-50 text-slate-700' : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      {turn.text}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {data.transcript && (
        <div className="card p-5">
          <h3 className="section-title">Transcrição Bruta</h3>
          <div className="bg-slate-50 rounded-lg p-4 max-h-60 overflow-y-auto">
            <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed font-mono">
              {data.transcript}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
