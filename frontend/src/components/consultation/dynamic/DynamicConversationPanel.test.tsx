import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DynamicConsultationRuntime, DynamicParticipant } from '@/types/forms'
import { DynamicConversationPanel } from './DynamicConversationPanel'

function participant(
  id: string,
  role: string,
  speakerLabel: string
): DynamicParticipant {
  return {
    id,
    consultationId: 'consulta-1',
    name: id,
    role,
    speakerLabel,
    authorized: true,
    authorizedAt: new Date().toISOString(),
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function renderConversation(runtime: DynamicConsultationRuntime) {
  return render(
    <DynamicConversationPanel
      runtime={runtime}
      topics={[]}
      onLoadTopics={vi.fn()}
    />
  )
}

describe('DynamicConversationPanel', () => {
  it('mostra papéis automáticos e desconhecidos numerados sem expor rótulos técnicos', () => {
    const runtime = {
      participants: [
        participant('profissional', 'profissional', 'speaker_0'),
        participant('paciente', 'paciente', 'speaker_1'),
      ],
      conversation: {
        transcript: 'Conversa clínica',
        segments: [],
        turns: [
          { speaker: 'Medico', text: 'Como você está?', diarizationLabel: 'speaker_0', roleSource: 'automatico' },
          { speaker: 'Paciente', text: 'Estou melhor.', diarizationLabel: 'speaker_1', roleSource: 'automatico' },
          {
            speaker: 'Indefinido',
            text: 'Fala ao fundo.',
            diarizationLabel: 'A',
            sessionReviewAuthorized: true,
          },
        ],
      },
    } as unknown as DynamicConsultationRuntime

    renderConversation(runtime)

    expect(screen.getByText('Profissional')).toBeInTheDocument()
    expect(screen.getByText('Paciente')).toBeInTheDocument()
    expect(screen.getByText('Desconhecido 1')).toBeInTheDocument()
    expect(screen.getAllByText('Automático')).toHaveLength(2)
    expect(screen.getByText('Revisão obrigatória')).toBeInTheDocument()
    expect(screen.queryByText('Excluído da IA')).not.toBeInTheDocument()
    expect(screen.queryByText('speaker_0')).not.toBeInTheDocument()
    expect(screen.queryByText('speaker_1')).not.toBeInTheDocument()
    expect(screen.queryByText('A')).not.toBeInTheDocument()
  })

  it('protege o fallback de segmentos contra nomes técnicos', () => {
    const runtime = {
      participants: [],
      conversation: {
        transcript: 'Transcrição',
        turns: [],
        segments: [{
          id: 'segmento-1',
          sequence: 1,
          text: 'Trecho transcrito',
          speakerLabel: 'speaker_9',
          speakerDisplayName: 'speaker_9',
        }],
      },
    } as unknown as DynamicConsultationRuntime

    renderConversation(runtime)

    expect(screen.getByText('Voz identificada')).toBeInTheDocument()
    expect(screen.queryByText('speaker_9')).not.toBeInTheDocument()
  })
})
