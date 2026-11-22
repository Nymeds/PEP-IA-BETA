import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  ConsultationStartDialog,
  type ActiveConsultationStartConflict,
} from './ConsultationStartDialog'

function renderDialog(options?: {
  remembered?: boolean
  busy?: boolean
  conflict?: ActiveConsultationStartConflict
  errorMessage?: string | null
  onClose?: () => void
  onStart?: (rememberTerms: boolean) => void
  onOpenActiveConsultation?: (consultationId: string) => void
}) {
  const onClose = options?.onClose || vi.fn()
  const onStart = options?.onStart || vi.fn()
  const onOpenActiveConsultation = options?.onOpenActiveConsultation || vi.fn()
  render(
    <ConsultationStartDialog
      patientName="Paciente Teste"
      scheduledAt="2026-07-22T14:30:00.000Z"
      templateName="Prontuário de Clínica Geral"
      remembered={options?.remembered || false}
      busy={options?.busy}
      conflict={options?.conflict}
      errorMessage={options?.errorMessage}
      onClose={onClose}
      onStart={onStart}
      onOpenActiveConsultation={onOpenActiveConsultation}
    />
  )
  return { onClose, onStart, onOpenActiveConsultation }
}

describe('ConsultationStartDialog', () => {
  it('exige ciência antes de liberar o início e não confunde isso com consentimento clínico', () => {
    const { onStart } = renderDialog()
    const startButton = screen.getByRole('button', { name: 'Iniciar consulta' })

    expect(screen.getByRole('dialog', { name: 'Antes de iniciar o atendimento' })).toBeInTheDocument()
    expect(startButton).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Termos e orientações de consentimento' }))
    expect(screen.getByText(/não registra o consentimento do paciente/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', {
      name: /Estou ciente dos requisitos para iniciar esta consulta/i,
    }))
    expect(startButton).toBeEnabled()

    fireEvent.click(screen.getByRole('checkbox', { name: /Não me lembrar novamente/i }))
    fireEvent.click(startButton)
    expect(onStart).toHaveBeenCalledWith(true)
  })

  it('mantém a confirmação marcada sem ocultar o modal', () => {
    renderDialog({ remembered: true })

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', {
      name: /Estou ciente dos requisitos para iniciar esta consulta/i,
    })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Não me lembrar novamente/i })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Iniciar consulta' })).toBeEnabled()
  })

  it('permite preparar depois sem iniciar a consulta', () => {
    const onClose = vi.fn()
    const onStart = vi.fn()
    renderDialog({ onClose, onStart })

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('expõe o conflito de consulta ativa e oferece acesso direto ao atendimento', () => {
    const conflict: ActiveConsultationStartConflict = {
      message: 'Já existe outra consulta em andamento para este médico',
      activeConsultation: {
        id: 'consulta-ativa',
        patientName: 'Paciente em atendimento',
        startedAt: '2026-07-22T22:42:44.359Z',
        scheduleTitle: 'Agenda Clínica Geral',
      },
    }
    const { onOpenActiveConsultation } = renderDialog({ conflict })

    expect(screen.getByRole('alert')).toHaveTextContent('Outra consulta já está em andamento')
    expect(screen.getByRole('alert')).toHaveTextContent('Paciente em atendimento')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir consulta em andamento' }))
    expect(onOpenActiveConsultation).toHaveBeenCalledWith('consulta-ativa')
  })

  it('mostra dentro do modal outros impedimentos de início', () => {
    renderDialog({ errorMessage: 'A consulta não possui uma versão de formulário publicada' })

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Não foi possível iniciar a consulta')
    expect(alert).toHaveTextContent('A consulta não possui uma versão de formulário publicada')
  })
})
