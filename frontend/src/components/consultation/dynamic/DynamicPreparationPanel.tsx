'use client'

import { useMemo, useState } from 'react'
import {
  CheckCircle2,
  CircleAlert,
  Mic2,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  Users,
  XCircle,
} from 'lucide-react'
import type {
  DynamicConsentType,
  DynamicConsultationRuntime,
  DynamicParticipant,
} from '@/types/forms'
import { Button } from '@/components/ui/Button'
import { cn } from '@/components/shared/utils'

export function isDynamicRecordingReady(runtime: DynamicConsultationRuntime) {
  const latestGlobal = new Map<string, boolean>()
  runtime.consents.forEach((consent) => {
    if (!consent.participantId && !latestGlobal.has(consent.type)) {
      latestGlobal.set(consent.type, consent.granted)
    }
  })
  const hasCoreConsents =
    latestGlobal.get('gravacao_audio') === true && latestGlobal.get('transcricao_ia') === true
  const participantsReady = runtime.participants.every(
    (participant) => !participant.active || participant.role === 'profissional' || participant.authorized
  )
  return hasCoreConsents && participantsReady
}

function consentStatus(
  runtime: DynamicConsultationRuntime,
  type: DynamicConsentType,
  participantId?: string
) {
  return runtime.consents.find(
    (consent) => consent.type === type && (consent.participantId || undefined) === participantId
  )
}

function DecisionButtons({
  value,
  busy,
  ariaLabel,
  onChange,
}: {
  value?: boolean
  busy?: boolean
  ariaLabel: string
  onChange: (granted: boolean) => void
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={ariaLabel}>
      <button
        type="button"
        disabled={busy}
        aria-pressed={value === true}
        onClick={() => onChange(true)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50',
          value === true
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
        )}
      >
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Aceitou
      </button>
      <button
        type="button"
        disabled={busy}
        aria-pressed={value === false}
        onClick={() => onChange(false)}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-semibold disabled:opacity-50',
          value === false
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-red-300'
        )}
      >
        <XCircle className="h-3 w-3" aria-hidden="true" /> Recusou
      </button>
    </div>
  )
}

export function DynamicPreparationPanel({
  runtime,
  busy,
  isDiarizing,
  onConsent,
  onAddParticipant,
  onUpdateParticipant,
  onDiarize,
}: {
  runtime: DynamicConsultationRuntime
  busy?: boolean
  isDiarizing?: boolean
  onConsent: (type: DynamicConsentType, granted: boolean, participantId?: string) => void
  onAddParticipant: (data: { name: string; role: string }) => void
  onUpdateParticipant: (
    participantId: string,
    data: Partial<Pick<DynamicParticipant, 'speakerLabel' | 'active'>>
  ) => void
  onDiarize: () => void
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('acompanhante')
  const recordingConsent = consentStatus(runtime, 'gravacao_audio')
  const aiConsent = consentStatus(runtime, 'transcricao_ia')
  const recordingReady = isDynamicRecordingReady(runtime)
  const speakerLabels = useMemo(
    () => Array.from(new Set(
      runtime.conversation.turns
        .map((turn) => turn.diarizationLabel)
        .filter((label): label is string => Boolean(label))
    )),
    [runtime.conversation.turns]
  )

  const submitParticipant = () => {
    if (!name.trim()) return
    onAddParticipant({ name: name.trim(), role })
    setName('')
  }

  return (
    <div className="space-y-4 p-4">
      <div className={cn(
        'rounded-xl border p-3',
        recordingReady
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      )} role="status">
        <div className="flex items-start gap-2">
          {recordingReady ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-700" />
          ) : (
            <CircleAlert className="mt-0.5 h-4 w-4 text-amber-700" />
          )}
          <div>
            <p className={cn('text-xs font-semibold', recordingReady ? 'text-emerald-900' : 'text-amber-900')}>
              {recordingReady ? 'Gravação liberada' : 'Gravação bloqueada'}
            </p>
            <p className={cn('mt-1 text-[11px]', recordingReady ? 'text-emerald-700' : 'text-amber-800')}>
              {recordingReady
                ? 'Consentimentos e participantes estão registrados.'
                : 'A consulta pode ser preenchida manualmente, mas nenhum áudio será capturado.'}
            </p>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary-600" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Consentimentos</h3>
        </div>
        <div className="space-y-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Gravação de áudio</p>
            <p className="mb-2 mt-1 text-[11px] text-slate-500">Finalidade, armazenamento e limitações foram explicados.</p>
            <DecisionButtons
              value={recordingConsent?.granted}
              busy={busy}
              ariaLabel="Decisão sobre o consentimento para gravação de áudio"
              onChange={(value) => onConsent('gravacao_audio', value)}
            />
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-800">Transcrição e assistência por IA</p>
            <p className="mb-2 mt-1 text-[11px] text-slate-500">A IA auxilia, mas não substitui a revisão profissional.</p>
            <DecisionButtons
              value={aiConsent?.granted}
              busy={busy}
              ariaLabel="Decisão sobre o consentimento para transcrição e assistência por IA"
              onChange={(value) => onConsent('transcricao_ia', value)}
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-600" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">Participantes</h3>
          </div>
          <span className="text-[10px] text-slate-400">{runtime.participants.filter((item) => item.active).length} ativos</span>
        </div>
        <div className="space-y-2">
          {runtime.participants.map((participant) => {
            const professional = participant.role === 'profissional'
            const coreParticipant = professional || participant.role === 'paciente'
            const participationConsent = consentStatus(runtime, 'participacao', participant.id)
            return (
              <div key={participant.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">{participant.name}</p>
                    <p className="text-[10px] capitalize text-slate-500">{participant.role.replaceAll('_', ' ')}</p>
                  </div>
                  {professional ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                      <UserRoundCheck className="h-3 w-3" /> Profissional
                    </span>
                  ) : (
                    <DecisionButtons
                      value={participationConsent?.granted ?? participant.authorized}
                      busy={busy}
                      ariaLabel={`Decisão sobre a participação de ${participant.name}`}
                      onChange={(value) => onConsent('participacao', value, participant.id)}
                    />
                  )}
                </div>
                {speakerLabels.length ? (
                  <label className="mt-2 block text-[10px] font-medium text-slate-500">
                    Voz identificada
                    <select
                      value={participant.speakerLabel || ''}
                      disabled={busy}
                      onChange={(event) => onUpdateParticipant(participant.id, {
                        speakerLabel: event.target.value || null,
                      })}
                      className="form-input mt-1 py-1.5 text-xs"
                    >
                      <option value="">Não associada</option>
                      {speakerLabels.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {!coreParticipant ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onUpdateParticipant(participant.id, { active: !participant.active })}
                    className="mt-2 text-[10px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50"
                  >
                    {participant.active ? 'Remover desta consulta' : 'Reativar participante'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>

        <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">Adicionar participante</p>
          <div className="mt-2 grid gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nome"
              className="form-input py-1.5 text-xs"
            />
            <select value={role} onChange={(event) => setRole(event.target.value)} className="form-input py-1.5 text-xs">
              <option value="acompanhante">Acompanhante</option>
              <option value="responsavel">Responsável</option>
              <option value="familiar">Familiar</option>
              <option value="interprete">Intérprete</option>
              <option value="outro">Outro</option>
            </select>
            <Button size="sm" onClick={submitParticipant} disabled={!name.trim() || busy}>
              <Plus className="h-3.5 w-3.5" /> Adicionar sem autorizar
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2">
          <Mic2 className="mt-0.5 h-4 w-4 text-cyan-600" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-800">Separação e identificação das vozes</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Execute após a gravação e associe cada voz acima antes de gerar a evolução.
            </p>
            <Button size="sm" className="mt-2" onClick={onDiarize} disabled={busy || isDiarizing}>
              <Mic2 className="h-3.5 w-3.5" />
              {isDiarizing ? 'Separando vozes...' : 'Separar vozes do áudio'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
