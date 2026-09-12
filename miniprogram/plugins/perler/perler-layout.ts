import type { PerlerCell, PerlerResult } from './perler-types'

export type PerlerRow = { key: string; cells: PerlerCell[] }

/** Preserve backend row-major order; device rounding must never choose row breaks. */
export function buildPerlerRows(result: PerlerResult): PerlerRow[] {
  const { size, cells } = result
  if (!Number.isInteger(size) || size < 8 || size > 64
    || !Array.isArray(cells) || cells.length !== size * size) {
    throw new Error('invalid perler grid dimensions')
  }
  return Array.from({ length: size }, (_, y) => ({
    key: `row-${y}`,
    cells: cells.slice(y * size, (y + 1) * size),
  }))
}
