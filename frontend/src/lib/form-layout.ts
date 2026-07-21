import type { ClinicalFormElement, FormElementLayout, FormElementType } from '@/types/forms'

export const FORM_CANVAS_WIDTH = 1200
export const FORM_GRID_SIZE = 8
export const FORM_LAYOUT_GAP = 16

const MIN_VISUAL_HEIGHT: Record<FormElementType, number> = {
  texto_curto: 96,
  texto_longo: 144,
  checkbox: 96,
  selecao_unica: 96,
  selecao_multipla: 144,
  numero: 96,
  data: 96,
  titulo: 64,
  divisor: 56,
  grupo_repetivel: 160,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function layoutsOverlap(
  first: Pick<FormElementLayout, 'x' | 'y' | 'width' | 'height'>,
  second: Pick<FormElementLayout, 'x' | 'y' | 'width' | 'height'>,
  gap = FORM_LAYOUT_GAP
) {
  return !(
    first.x + first.width + gap <= second.x ||
    second.x + second.width + gap <= first.x ||
    first.y + first.height + gap <= second.y ||
    second.y + second.height + gap <= first.y
  )
}

export interface ResolvedFormLayout extends FormElementLayout {
  wasRepositioned: boolean
}

/**
 * Protege o runtime contra versões antigas ou importadas com coordenadas inválidas.
 * A posição horizontal é preservada e apenas o eixo vertical é deslocado quando
 * necessário, inclusive quando o conteúdo real cresce além da altura cadastrada.
 */
export function resolveDynamicCanvasLayout(
  elements: ClinicalFormElement[],
  measuredHeights: Record<string, number> = {}
) {
  const placed: Array<{ id: string; layout: ResolvedFormLayout }> = []
  const sorted = [...elements].sort((left, right) =>
    left.layout.y - right.layout.y ||
    left.layout.x - right.layout.x ||
    left.layout.mobileOrder - right.layout.mobileOrder
  )

  sorted.forEach((element) => {
    const width = clamp(element.layout.width, 160, FORM_CANVAS_WIDTH)
    const x = clamp(element.layout.x, 0, FORM_CANVAS_WIDTH - width)
    const height = Math.max(
      element.layout.height,
      MIN_VISUAL_HEIGHT[element.type],
      measuredHeights[element.id] || 0
    )
    let y = Math.max(0, element.layout.y)
    let attempts = 0

    while (attempts < elements.length + 2) {
      const candidate = { x, y, width, height }
      const collisions = placed.filter((item) => layoutsOverlap(candidate, item.layout))
      if (!collisions.length) break
      y = Math.max(...collisions.map((item) => item.layout.y + item.layout.height + FORM_LAYOUT_GAP))
      attempts += 1
    }

    placed.push({
      id: element.id,
      layout: {
        ...element.layout,
        x,
        y,
        width,
        height,
        wasRepositioned: x !== element.layout.x || y !== element.layout.y || width !== element.layout.width,
      },
    })
  })

  return Object.fromEntries(placed.map((item) => [item.id, item.layout])) as Record<string, ResolvedFormLayout>
}
