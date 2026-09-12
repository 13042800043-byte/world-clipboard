import type { ClipboardItem } from '../../clipboard/clipboard-types'
import type { PerlerCell, PerlerColorCount, PerlerResult } from './perler-types'

type RequestOptions = {
  url: string
  method: 'POST'
  header: { 'content-type': 'application/json' }
  data: { image: string; size: number }
  timeout: number
  success(result: { statusCode: number; data: unknown }): void
  fail(error: unknown): void
}

type Request = (options: RequestOptions) => unknown

export class RemotePerlerGenerator {
  constructor(
    private readonly baseUrl: string,
    private readonly request: Request = (options) => wx.request(options),
  ) {}

  async generate(item: ClipboardItem, size = 32): Promise<PerlerResult> {
    const image = item.previewImage
    if (!image?.startsWith('data:image/png;base64,')) {
      throw new Error('请先完成真实物体抠图')
    }

    return new Promise((resolve, reject) => {
      this.request({
        url: `${this.baseUrl.replace(/\/$/, '')}/api/perler`,
        method: 'POST',
        header: { 'content-type': 'application/json' },
        data: { image, size },
        timeout: 8000,
        success(result) {
          if (result.statusCode < 200 || result.statusCode >= 300) {
            reject(new Error(`perler request failed (${result.statusCode})`))
            return
          }
          try {
            resolve(parsePerlerResult(result.data))
          } catch (error) {
            reject(error)
          }
        },
        fail: reject,
      })
    })
  }
}

export function parsePerlerResult(value: unknown): PerlerResult {
  if (!value || typeof value !== 'object') throw new Error('invalid perler response')
  const result = value as Record<string, unknown>
  const size = result.size
  const cells = result.cells
  const colors = result.colors
  const totalBeads = result.totalBeads

  if (
    typeof size !== 'number'
    || !Number.isInteger(size)
    || size < 8
    || size > 64
    || !Array.isArray(cells)
    || cells.length !== size * size
    || !cells.every(isPerlerCell)
    || !Array.isArray(colors)
    || !colors.every(isPerlerColor)
    || typeof totalBeads !== 'number'
    || !Number.isInteger(totalBeads)
    || totalBeads < 0
  ) {
    throw new Error('invalid perler response')
  }

  const occupied = cells.filter((cell) => !cell.empty).length
  const counted = colors.reduce((total, color) => total + color.count, 0)
  if (occupied !== totalBeads || counted !== totalBeads) {
    throw new Error('invalid perler response')
  }
  return { size, cells, colors, totalBeads }
}

function isPerlerCell(value: unknown): value is PerlerCell {
  if (!value || typeof value !== 'object') return false
  const cell = value as Record<string, unknown>
  return typeof cell.key === 'string'
    && typeof cell.color === 'string'
    && /^#[0-9A-F]{6}$/i.test(cell.color)
    && typeof cell.empty === 'boolean'
}

function isPerlerColor(value: unknown): value is PerlerColorCount {
  if (!value || typeof value !== 'object') return false
  const color = value as Record<string, unknown>
  return typeof color.id === 'string'
    && typeof color.name === 'string'
    && typeof color.hex === 'string'
    && /^#[0-9A-F]{6}$/i.test(color.hex)
    && typeof color.count === 'number'
    && Number.isInteger(color.count)
    && color.count > 0
}
