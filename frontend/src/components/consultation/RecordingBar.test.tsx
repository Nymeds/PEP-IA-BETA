import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { RecordingBar } from './RecordingBar'

const baseProps = {
  recordingState: 'idle' as const,
  transcriptionMode: 'none' as const,
  transcript: '',
  onStart: vi.fn(),
  onStop: vi.fn(),
}

describe('RecordingBar', () => {
  it('mantém o microfone desabilitado e oferece acesso à preparação quando a gravação está bloqueada', () => {
    const onPrepare = vi.fn()

    render(
      <RecordingBar
        {...baseProps}
        disabled
        disabledReason="Consentimentos pendentes"
        onPrepare={onPrepare}
      />,
    )

    expect(screen.getByRole('button', { name: 'Consentimentos pendentes' })).toBeDisabled()

    const prepareButton = screen.getByRole('button', { name: 'Registrar consentimentos' })
    fireEvent.click(prepareButton)

    expect(onPrepare).toHaveBeenCalledTimes(1)
  })

  it('habilita o início da gravação e oculta a preparação quando a gravação está liberada', () => {
    render(<RecordingBar {...baseProps} disabled={false} onPrepare={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Registrar consentimentos' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar gravação' })).toBeEnabled()
  })
})
