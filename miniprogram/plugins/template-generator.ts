import type { ClipboardItem } from '../clipboard/clipboard-types'
import type { TemplateKind, TemplateOptions, TemplateResult } from './template-types'

export function isTemplateKind(value: string): value is TemplateKind {
  return ['sticker', 'pixel', 'lego', 'cross-stitch'].includes(value)
}
export function isPngDataUrl(value: unknown): value is string {
  // Bounded 1024px sticker and 1200×1697 sheet can exceed 4 MB for detailed photos.
  return typeof value === 'string' && value.length <= 9_000_000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
}
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 400

export function parseTemplateResult(value: unknown, kind: TemplateKind): TemplateResult {
  if (!value || typeof value !== 'object') throw new Error('invalid template response')
  const result = value as TemplateResult
  if (result.kind !== kind || !isPngDataUrl(result.previewImage) || !isPngDataUrl(result.chartImage) || !isPngDataUrl(result.exportImage)
    || !['title', 'previewLabel', 'chartLabel', 'exportLabel', 'paletteLabel'].every(key => text(result[key]))
    || !Array.isArray(result.metrics) || result.metrics.length > 8 || !result.metrics.every(m => m && text(m.label) && text(m.value))
    || !Array.isArray(result.materials) || result.materials.length > 256 || !result.materials.every(m => m && text(m.id) && text(m.name) && text(m.unit)
      && typeof m.hex === 'string' && /^#[0-9A-F]{6}$/i.test(m.hex) && Number.isInteger(m.count) && m.count > 0 && m.count <= 4096)
    || !Array.isArray(result.notes) || result.notes.length > 10 || !result.notes.every(text)) throw new Error('invalid template response')
  const ids = result.materials.map(m => m.id)
  if (new Set(ids).size !== ids.length) throw new Error('invalid template material ids')
  return { kind, title: result.title, previewImage: result.previewImage, chartImage: result.chartImage, exportImage: result.exportImage,
    previewLabel: result.previewLabel, chartLabel: result.chartLabel, exportLabel: result.exportLabel, paletteLabel: result.paletteLabel,
    metrics: result.metrics, materials: result.materials, notes: result.notes }
}

type Request = (options: { url: string; method: 'POST'; header: { 'content-type': 'application/json' }; data: Record<string, unknown>; timeout: number;
  success(result: { statusCode: number; data: unknown }): void; fail(error: unknown): void }) => unknown

export class RemoteTemplateGenerator {
  constructor(private readonly baseUrl: string, private readonly request: Request = options => wx.request(options)) {}
  async generate(kind: TemplateKind, item: ClipboardItem, options: TemplateOptions): Promise<TemplateResult> {
    if (!isTemplateKind(kind)) throw new Error('unknown template')
    if (!item.previewImage?.startsWith('data:image/png;base64,')) throw new Error('请先完成真实物体抠图')
    return new Promise((resolve, reject) => this.request({
      url: `${this.baseUrl.replace(/\/$/, '')}/api/templates/${kind}`, method: 'POST', header: { 'content-type': 'application/json' },
      data: { image: item.previewImage, ...options }, timeout: 12000,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) { reject(new Error(`template request failed (${response.statusCode})`)); return }
        try { resolve(parseTemplateResult(response.data, kind)) } catch (error) { reject(error) }
      }, fail: reject,
    }))
  }
}
