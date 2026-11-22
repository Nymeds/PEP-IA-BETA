import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  FORM_FIELD_ICON_OPTIONS,
  FormFieldIcon,
  isFormFieldIconName,
} from './FormFieldIcon'

describe('FormFieldIcon', () => {
  it('oferece um catalogo amplo e tipado de icones', () => {
    expect(FORM_FIELD_ICON_OPTIONS.length).toBeGreaterThanOrEqual(20)
    expect(isFormFieldIconName('Stethoscope')).toBe(true)
    expect(isFormFieldIconName('<svg>')).toBe(false)
  })

  it('renderiza o SVG selecionado e usa fallback seguro', () => {
    const selected = render(<FormFieldIcon name="Stethoscope" aria-label="Estetoscópio" />)
    expect(selected.container.querySelector('.lucide-stethoscope')).toBeTruthy()
    selected.unmount()

    const fallback = render(<FormFieldIcon name="IconeDesconhecido" aria-label="Ícone geral" />)
    expect(fallback.container.querySelector('.lucide-layout-grid')).toBeTruthy()
  })
})
