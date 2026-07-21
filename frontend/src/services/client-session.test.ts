import { describe, expect, it, vi } from 'vitest'
import {
  clearClinicalSessionStorage,
  notifySessionExpired,
  SESSION_EXPIRED_EVENT,
} from './client-session'

describe('estado privado da sessão', () => {
  it('remove rascunhos clínicos sem apagar outras chaves da sessão', () => {
    sessionStorage.setItem('pep-consultation-draft:consulta-1', '{"sigiloso":true}')
    sessionStorage.setItem('pep-dynamic-consultation:consulta-2', '{"sigiloso":true}')
    sessionStorage.setItem('preferencia-nao-clinica', 'manter')

    clearClinicalSessionStorage(sessionStorage)

    expect(sessionStorage.getItem('pep-consultation-draft:consulta-1')).toBeNull()
    expect(sessionStorage.getItem('pep-dynamic-consultation:consulta-2')).toBeNull()
    expect(sessionStorage.getItem('preferencia-nao-clinica')).toBe('manter')
    sessionStorage.clear()
  })

  it('avisa a aplicação quando uma resposta informa sessão expirada', () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    notifySessionExpired()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })
})
