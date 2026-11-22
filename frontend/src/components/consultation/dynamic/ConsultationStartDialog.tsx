'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface ActiveConsultationStartConflict {
  message: string
  activeConsultation: {
    id: string
    patientName: string
    startedAt: string | null
    scheduleTitle: string | null
  }
}

interface ConsultationStartDialogProps {
  patientName: string
  scheduledAt?: string
  templateName: string
  remembered: boolean
  busy?: boolean
  conflict?: ActiveConsultationStartConflict | null
  errorMessage?: string | null
  onClose: () => void
  onStart: (rememberTerms: boolean) => void | Promise<void>
  onOpenActiveConsultation: (consultationId: string) => void
}

function formatScheduledAt(value?: string) {
  if (!value) return 'Horário não informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Horário não informado'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ConsultationStartDialog({
  patientName,
  scheduledAt,
  templateName,
  remembered,
  busy = false,
  conflict,
  errorMessage,
  onClose,
  onStart,
  onOpenActiveConsultation,
}: ConsultationStartDialogProps) {
  const [termsExpanded, setTermsExpanded] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(remembered)
  const [rememberChoice, setRememberChoice] = useState(remembered)
  const dialogRef = useRef<HTMLDivElement>(null)
  const acceptanceRef = useRef<HTMLInputElement>(null)
  const startButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    setTermsExpanded(false)
    setTermsAccepted(remembered)
    setRememberChoice(remembered)
  }, [remembered])

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const animationFrame = window.requestAnimationFrame(() => {
      if (remembered) startButtonRef.current?.focus()
      else acceptanceRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) || []
      ).filter((element) => !element.hasAttribute('disabled'))
      if (!focusable.length) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [remembered])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-[2px] sm:p-5">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consultation-start-title"
        aria-describedby="consultation-start-description"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      >
        <div className="relative shrink-0 overflow-hidden border-b border-slate-200 bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-5 py-5 sm:px-6">
          <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-blue-100/60 blur-2xl" aria-hidden="true" />
          <div className="relative flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-700 shadow-sm">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">Etapa de entrada</p>
              <h2 id="consultation-start-title" className="mt-1 text-xl font-semibold text-slate-950">
                Antes de iniciar o atendimento
              </h2>
              <p id="consultation-start-description" className="mt-1.5 text-sm leading-6 text-slate-600">
                Confirme que você conhece os requisitos de consentimento para liberar o início da consulta.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 disabled:pointer-events-none disabled:opacity-50"
              aria-label="Fechar e preparar depois"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Paciente</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">{patientName}</p>
            </div>
            <div className="min-w-0 sm:border-l sm:border-slate-200 sm:pl-4">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Agendamento
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{formatScheduledAt(scheduledAt)}</p>
            </div>
            <div className="min-w-0 sm:col-span-2 sm:border-t sm:border-slate-200 sm:pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Formulário</p>
              <p className="mt-1 truncate text-sm font-medium text-slate-700">{templateName}</p>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-blue-950">O início libera apenas o atendimento</p>
                <p className="mt-1 text-xs leading-5 text-blue-800">
                  Áudio, transcrição e preenchimento por IA continuam bloqueados até as decisões desta consulta serem registradas em Consentimentos.
                </p>
              </div>
            </div>
          </div>

          {conflict ? (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-amber-950">
                    Outra consulta já está em andamento
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">{conflict.message}</p>
                  <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {conflict.activeConsultation.patientName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {conflict.activeConsultation.scheduleTitle || 'Agenda não informada'}
                      {' · '}
                      Iniciada em {formatScheduledAt(conflict.activeConsultation.startedAt || undefined)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => onOpenActiveConsultation(conflict.activeConsultation.id)}
                    disabled={busy}
                  >
                    Abrir consulta em andamento
                  </Button>
                </div>
              </div>
            </div>
          ) : errorMessage ? (
            <div
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-950">Não foi possível iniciar a consulta</p>
                  <p className="mt-1 text-xs leading-5 text-red-800">{errorMessage}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-slate-50"
              aria-expanded={termsExpanded}
              aria-controls="consultation-start-terms"
              onClick={() => setTermsExpanded((current) => !current)}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileText className="h-4 w-4 text-primary-600" aria-hidden="true" />
                Termos e orientações de consentimento
              </span>
              {termsExpanded ? (
                <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
            </button>

            {termsExpanded ? (
              <div id="consultation-start-terms" className="border-t border-slate-200 bg-slate-50/70 px-4 py-4">
                <ul className="space-y-3 text-xs leading-5 text-slate-600">
                  <li className="flex gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    Explique a finalidade, o armazenamento e as limitações da gravação e da transcrição.
                  </li>
                  <li className="flex gap-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                    Registre separadamente a decisão do paciente e de cada participante ativo.
                  </li>
                  <li className="flex gap-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                    Revise profissionalmente todo conteúdo sugerido pela IA antes de incorporá-lo ao prontuário.
                  </li>
                </ul>
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                  Esta confirmação é uma ciência do profissional. Ela não registra o consentimento do paciente nem autoriza a captura de áudio.
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2.5">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 hover:border-primary-300">
              <input
                ref={acceptanceRef}
                type="checkbox"
                checked={termsAccepted}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.target.checked
                  setTermsAccepted(checked)
                  if (!checked) setRememberChoice(false)
                }}
                className="mt-0.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  Estou ciente dos requisitos para iniciar esta consulta
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  Os consentimentos clínicos serão registrados separadamente antes da gravação ou do uso da IA.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <input
                type="checkbox"
                checked={rememberChoice}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.target.checked
                  setRememberChoice(checked)
                  if (checked) setTermsAccepted(true)
                }}
                className="mt-0.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Não me lembrar novamente</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                  Nas próximas consultas, esta confirmação ficará marcada. O modal continuará aparecendo para você iniciar o atendimento.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Button onClick={onClose} disabled={busy} className="sm:min-w-28">
            Agora não
          </Button>
          <Button
            ref={startButtonRef}
            variant="primary"
            disabled={!termsAccepted || busy}
            onClick={() => void onStart(rememberChoice)}
            className="sm:min-w-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            {busy ? 'Iniciando...' : 'Iniciar consulta'}
          </Button>
        </div>
      </div>
    </div>
  )
}
