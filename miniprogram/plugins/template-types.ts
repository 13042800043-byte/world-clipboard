import type { ClipboardItem } from '../clipboard/clipboard-types'

export type TemplateKind = 'sticker' | 'pixel' | 'lego' | 'cross-stitch'
export interface TemplateOptions { size: 32 | 48 | 64; maxColors: 8 | 16 | 24; border: 0 | 8 | 16 }
export interface TemplateResult {
  kind: TemplateKind; title: string
  previewImage: string; chartImage: string; exportImage: string
  previewLabel: string; chartLabel: string; exportLabel: string; paletteLabel: string
  metrics: Array<{ label: string; value: string }>
  materials: Array<{ id: string; name: string; hex: string; count: number; unit: string }>
  notes: string[]
}
export interface TemplatePlugin {
  kind: TemplateKind; title: string; defaults: TemplateOptions
  generate(item: ClipboardItem, options: TemplateOptions): Promise<TemplateResult>
}
