import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dynamicConsultationApi } from '@/services/dynamic-consultation-api'
import type {
  DynamicConsultationRuntime,
  DynamicTranscriptVersionCreateResult,
} from '@/types/forms'
import { DynamicConversationHistoryModal } from './DynamicConversationHistoryModal'

function runtimeWithTranscript(transcript: string) {
  return {
    consultationId: 'consulta-1',
    participants: [],
    conversation: {
      transcript,
      turns: [],
      segments: [],
    },
  } as unknown as DynamicConsultationRuntime
}

function renderHistory(
  runtime = runtimeWithTranscript('Paciente relata dor. A dor começou ontem.'),
  options?: {
    onBeforeVersionCreate?: () => Promise<void>
    onVersionCreated?: (result: DynamicTranscriptVersionCreateResult) => Promise<void>
  }
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <DynamicConversationHistoryModal
        runtime={runtime}
        consultationStatus="em_consulta"
        onClose={vi.fn()}
        onBeforeVersionCreate={options?.onBeforeVersionCreate || vi.fn().mockResolvedValue(undefined)}
        onVersionCreated={options?.onVersionCreated || vi.fn().mockResolvedValue(undefined)}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DynamicConversationHistoryModal', () => {
  it('busca e destaca ocorrências na transcrição atual', () => {
    const { container } = renderHistory()

    fireEvent.change(screen.getByPlaceholderText('Buscar e destacar na conversa'), {
      target: { value: 'dor' },
    })

    expect(screen.getByText('2 resultados')).toBeInTheDocument()
    expect(container.querySelectorAll('mark')).toHaveLength(2)
    expect(screen.getByRole('dialog', { name: 'Histórico da conversa' })).toBeInTheDocument()
  })

  it('carrega tópicos com os trechos que os sustentam', async () => {
    vi.spyOn(dynamicConsultationApi, 'topics').mockResolvedValue({
      topics: [{
        title: 'Dor abdominal',
        summary: 'Queixa iniciada no dia anterior.',
        evidence: [{
          segmentId: 'segmento-1',
          sequence: 1,
          quote: 'A dor começou ontem.',
          speakerLabel: null,
          startMs: null,
          endMs: null,
        }],
      }],
    })
    renderHistory()

    fireEvent.click(screen.getByRole('tab', { name: 'Tópicos' }))

    expect(await screen.findByText('Dor abdominal')).toBeInTheDocument()
    expect(screen.getByText('“A dor começou ontem.”')).toBeInTheDocument()
  })

  it('distingue citação contextual de voz ambígua com revisão obrigatória', () => {
    const runtime = runtimeWithTranscript(
      'Minha filha teve febre. Uma terceira voz comenta ao fundo.'
    )
    runtime.conversation.turns = [
      {
        speaker: 'Terceiro',
        text: 'Minha filha teve febre.',
        diarizationLabel: 'speaker_C',
        speakerDisplayName: 'Mãe do paciente',
        roleSource: 'automatico',
        roleConfidence: 0.91,
        contextualRelation: 'Mãe do paciente',
        sessionContextAuthorized: true,
      },
      {
        speaker: 'Indefinido',
        text: 'Uma terceira voz comenta ao fundo.',
        diarizationLabel: 'speaker_D',
        roleSource: 'desconhecido',
        sessionReviewAuthorized: true,
      },
    ]

    renderHistory(runtime)

    expect(screen.getByText('Mãe do paciente')).toBeInTheDocument()
    expect(screen.getByText('Citação atribuída')).toBeInTheDocument()
    expect(screen.getByText('Não preenche o PEP')).toBeInTheDocument()
    expect(screen.getByText('Desconhecido 1')).toBeInTheDocument()
    expect(screen.getByText('Revisão obrigatória')).toBeInTheDocument()
    expect(screen.queryByText('Fora do SOAP')).not.toBeInTheDocument()
  })

  it('preserva uma correção como versão e entrega o runtime atualizado', async () => {
    const updatedRuntime = runtimeWithTranscript(
      'Paciente relata dor abdominal. A dor começou ontem.'
    )
    const result: DynamicTranscriptVersionCreateResult = {
      savedVersion: 3,
      removedAiFieldIds: ['queixa'],
      requiresSpeakerRemapping: false,
      runtime: updatedRuntime,
    }
    const beforeCreate = vi.fn().mockResolvedValue(undefined)
    const onVersionCreated = vi.fn().mockResolvedValue(undefined)
    const listVersions = vi.spyOn(dynamicConsultationApi, 'transcriptVersions').mockResolvedValue([
      {
        id: 'versao-2',
        consultationId: 'consulta-1',
        version: 2,
        transcript: 'Paciente relata dor.',
        reason: 'Correção anterior',
        editDiff: null,
        createdAt: '2026-07-23T12:00:00.000Z',
      },
    ])
    const createVersion = vi.spyOn(
      dynamicConsultationApi,
      'createTranscriptVersion'
    ).mockResolvedValue(result)
    renderHistory(undefined, { onBeforeVersionCreate: beforeCreate, onVersionCreated })

    fireEvent.click(screen.getByRole('tab', { name: 'Versões' }))
    expect(await screen.findByText('Versão 2')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Transcrição'), {
      target: { value: updatedRuntime.conversation.transcript },
    })
    fireEvent.change(screen.getByLabelText('Motivo da correção (opcional)'), {
      target: { value: 'Especificar localização da dor' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar correção' }))

    await waitFor(() => expect(onVersionCreated).toHaveBeenCalledWith(result))
    expect(beforeCreate).toHaveBeenCalledOnce()
    expect(createVersion).toHaveBeenCalledWith('consulta-1', {
      newTranscript: updatedRuntime.conversation.transcript,
      reason: 'Especificar localização da dor',
      editDiff: {
        before: 'Paciente relata dor. A dor começou ontem.',
        after: updatedRuntime.conversation.transcript,
      },
    })
    expect(listVersions).toHaveBeenCalled()
    expect(screen.getByText('Nenhuma alteração pendente.')).toBeInTheDocument()
  })
})
