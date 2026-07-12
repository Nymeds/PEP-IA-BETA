import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FeedbackProvider, useFeedback } from './FeedbackProvider'

function ConfirmHarness() {
  const { confirm } = useFeedback()
  return <button onClick={() => void confirm({ title: 'Excluir?', description: 'Ação permanente', danger: true })}>Abrir</button>
}

describe('FeedbackProvider', () => {
  it('abre confirmação acessível e fecha com cancelamento', () => {
    render(<FeedbackProvider><ConfirmHarness /></FeedbackProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByRole('dialog', { name: 'Excluir?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
