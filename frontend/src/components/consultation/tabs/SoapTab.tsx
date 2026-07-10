'use client'

import { Consultation, DialogueTurn } from '@/types'
import { FileText, Sparkles, Stethoscope, User } from 'lucide-react'
import { parseJson } from '../../shared/utils'

interface Props {
  data: Consultation
  onChange: (field: keyof Consultation, value: unknown) => void
}

const FIELDS: { key: keyof Consultation; label: string; letter: string; color: string; hint: string }[] = [
  {
    key: 'subjective',
    label: 'Subjetivo',
    letter: 'S',
    color: 'bg-blue-600',
    hint: 'Queixas, sintomas e história relatada',
  },
  {
    key: 'objective',
    label: 'Objetivo',
    letter: 'O',
    color: 'bg-teal-600',
    hint: 'Sinais vitais, exame físico e dados mensuráveis',
  },
  {
    key: 'assessment',
    label: 'Avaliação',
    letter: 'A',
    color: 'bg-violet-600',
    hint: 'Hipóteses, diagnósticos e raciocínio clínico',
  },
  {
    key: 'plan',
    label: 'Plano',
    letter: 'P',
    color: 'bg-amber-600',
    hint: 'Condutas, orientações, exames e retorno',
  },
]

export function SoapTab({ data, onChange }: Props) {
  const hasSoap = data.subjective || data.objective || data.assessment || data.plan
  const turns: DialogueTurn[] = parseJson(data.transcriptStructured, [])

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold text-slate-800">Evolução clínica - SOAP</h2>
        {hasSoap ? (
          <span className="ai-badge">
            <Sparkles className="h-3 w-3" />
            Gerado pela IA
          </span>
        ) : null}
      </div>

      {!hasSoap ? (
        <div className="card border-dashed p-8 text-center">
          <FileText className="mx-auto mb-3 h-12 w-12 text-slate-200" />
          <p className="mb-1 text-sm text-slate-500">O SOAP ainda não foi gerado.</p>
          <p className="text-xs text-slate-400">
            Encerre a gravação, revise os dados principais e clique em Gerar SOAP.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {FIELDS.map(({ key, label, letter, color, hint }) => (
          <div key={key} className="card overflow-hidden">
            <div className={`${color} flex items-center gap-3 px-4 py-2.5`}>
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                {letter}
              </span>
              <span className="text-sm font-medium text-white">{label}</span>
              <span className="ml-auto hidden text-xs text-white/75 md:inline">{hint}</span>
            </div>
            <div className="p-4">
              <textarea
                value={(data[key] as string) || ''}
                onChange={(event) => onChange(key, event.target.value)}
                rows={4}
                placeholder={`${label}...`}
                className="form-textarea resize-none border-0 p-0 text-slate-700 focus:ring-0"
              />
            </div>
          </div>
        ))}
      </div>

      {turns.length > 0 ? (
        <div className="card p-5">
          <h3 className="section-title flex items-center gap-2">
            Diálogo da consulta
            <span className="ai-badge">
              <Sparkles className="h-3 w-3" />
              Falantes identificados pela IA
            </span>
          </h3>
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {turns.map((turn, index) => {
              const isDoctor = turn.speaker === 'Médico'
              const isPatient = turn.speaker === 'Paciente'
              return (
                <div key={index} className={`flex gap-2.5 ${isDoctor ? '' : 'flex-row-reverse'}`}>
                  <div
                    className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                      isDoctor
                        ? 'bg-primary-100 text-primary-600'
                        : isPatient
                          ? 'bg-teal-100 text-teal-600'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isDoctor ? <Stethoscope className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`max-w-[80%] ${isDoctor ? 'text-left' : 'text-right'}`}>
                    <p
                      className={`mb-0.5 text-[10px] font-medium ${
                        isDoctor ? 'text-primary-500' : isPatient ? 'text-teal-500' : 'text-slate-400'
                      }`}
                    >
                      {turn.speaker}
                    </p>
                    <p
                      className={`inline-block rounded-lg px-3 py-2 text-xs leading-relaxed ${
                        isDoctor
                          ? 'bg-primary-50 text-slate-700'
                          : isPatient
                            ? 'bg-teal-50 text-slate-700'
                            : 'bg-slate-50 text-slate-500'
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
      ) : null}
    </div>
  )
}
