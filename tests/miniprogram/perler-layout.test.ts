import { describe, expect, it } from 'vitest'
import { buildPerlerRows } from '../../miniprogram/plugins/perler/perler-layout'
import type { PerlerResult } from '../../miniprogram/plugins/perler/perler-types'

function squareResult(size: number): PerlerResult {
  return {
    size,
    cells: Array.from({ length: size * size }, (_, index) => ({
      key: `cell-${index}`,
      color: index % size === Math.floor(index / size) ? '#D9363E' : '#EEF0F2',
      empty: index % size !== Math.floor(index / size),
    })),
    colors: [{ id: 'R01', name: '正红', hex: '#D9363E', count: size }],
    totalBeads: size,
  }
}

describe('buildPerlerRows', () => {
  it.each([8, 32, 64])('keeps a size-%i square board in explicit row-major rows without shifting any cell', (size) => {
    const result = squareResult(size)

    const rows = buildPerlerRows(result)

    expect(rows).toHaveLength(size)
    expect(new Set(rows.map((row) => row.key)).size).toBe(size)
    expect(rows.every((row) => typeof row.key === 'string')).toBe(true)
    for (let y = 0; y < size; y += 1) {
      expect(rows[y].cells).toHaveLength(size)
      for (let x = 0; x < size; x += 1) {
        expect(rows[y].cells[x]).toBe(result.cells[y * size + x])
      }
      // The synthetic diagonal must stay at x=y, rather than walking across
      // successive rows when a device rounds fractional cell widths.
      expect(rows[y].cells.findIndex((cell) => !cell.empty)).toBe(y)
    }
    expect(rows.flatMap((row) => row.cells)).toEqual(result.cells)
  })

  it('does not mutate a frozen generator result or its cells', () => {
    const result = squareResult(8)
    result.cells.forEach(Object.freeze)
    Object.freeze(result.cells)
    Object.freeze(result)

    expect(() => buildPerlerRows(result)).not.toThrow()
    expect(buildPerlerRows(result)[1].cells[0]).toBe(result.cells[8])
  })

  it.each([1023, 1025, 31 * 32])('rejects %i cells for a 32×32 board instead of displaying a shifted partial board', (count) => {
    const result = squareResult(32)
    result.cells = Array.from({ length: count }, (_, index) => result.cells[index % 1024])

    expect(() => buildPerlerRows(result)).toThrow()
  })

  it.each([0, 7, 65, 8.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects an invalid board size (%s)', (size) => {
    expect(() => buildPerlerRows({ ...squareResult(8), size })).toThrow()
  })

  it.each([null, undefined, {}])('rejects a non-array cells payload (%s)', (cells) => {
    const malformed = { ...squareResult(8), cells } as unknown as PerlerResult

    expect(() => buildPerlerRows(malformed)).toThrow()
  })
})
