import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DynamicConsultationRuntime } from '@/types/forms'
import { DynamicEvolutionPanel } from './DynamicEvolutionPanel'

describe('DynamicEvolutionPanel', () => {
  it('explica que falas contextuais e ambíguas não preenchem o PEP automaticamente', () => {
    const runtime = {
      template: { defaultDocumentFormat: 'SOAP' },
      generatedDocuments: [],
      quarantine: [],
      definition: { documents: [] },
      conversation: {
        transcript: 'Conversa clínica',
        segments: [],
        turns: [
          {
            speaker: 'Terceiro',
            text: 'Sou a mãe do paciente.',
            diarizationLabel: 'speaker_2',
            contextualRelation: 'Mãe do paciente',
            sessionContextAuthorized: true,
          },
          {
            speaker: 'Indefinido',
            text: 'Ele também teve dor.',
            diarizationLabel: 'speaker_3',
            sessionReviewAuthorized: true,
          },
        ],
      },
    } as unknown as DynamicConsultationRuntime

    render(
      <DynamicEvolutionPanel
        runtime={runtime}
        canGenerate
        excludedVoiceCount={1}
        canCreateManual
        canConfirm
        onGenerate={vi.fn()}
        onCreateManual={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Uso das falas na evolução')).toBeInTheDocument()
    expect(screen.getByText(/podem ser citadas com atribuição/)).toBeInTheDocument()
    expect(screen.getByText(/não preenchem o PEP automaticamente/)).toBeInTheDocument()
    expect(screen.getByText(/sugestões com revisão obrigatória/)).toBeInTheDocument()
    expect(screen.queryByText(/serão excluídas do preenchimento por IA/)).not.toBeInTheDocument()
  })
})
