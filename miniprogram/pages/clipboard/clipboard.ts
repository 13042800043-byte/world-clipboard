import { clipboardStore } from '../../clipboard/clipboard-store'
import type { ClipboardItem } from '../../clipboard/clipboard-types'
import { generateMockPerler } from '../../plugins/perler/perler-generator'

const templates = [
  { id: 'perler', label: '拼豆模板', active: false, disabled: false },
  { id: 'sticker', label: '贴纸', active: false, disabled: true },
  { id: 'pixel', label: '像素画', active: false, disabled: true },
  { id: 'lego', label: 'LEGO 模板', active: false, disabled: true },
  { id: 'cross-stitch', label: '十字绣', active: false, disabled: true },
]

Page({
  data: {
    item: createFallbackItem(),
    typeLabel: '物体',
    colorHex: '#6E747A',
    rgbText: '110, 116, 122',
    templates,
    showPerler: false,
    perler: {
      size: 32,
      cells: [],
      colors: [],
      totalBeads: 0,
    },
  },

  onShow() {
    const item = clipboardStore.get() || createFallbackItem()
    const color = item.color || { hex: '#6E747A', rgb: [110, 116, 122] as [number, number, number] }
    this.setData({
      item,
      typeLabel: getTypeLabel(item.type),
      colorHex: color.hex,
      rgbText: color.rgb.join(', '),
      showPerler: false,
      templates: templates.map((template) => ({ ...template, active: false })),
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onTemplateSelect(event: { detail: { id: string } }) {
    if (event.detail.id !== 'perler') return
    const perler = generateMockPerler(this.data.item.type)
    this.setData({
      perler,
      showPerler: true,
      templates: templates.map((template) => ({
        ...template,
        active: template.id === 'perler',
      })),
    })
    setTimeout(() => wx.pageScrollTo({ selector: '#perler-result', duration: 360 }), 80)
  },
})

function createFallbackItem(): ClipboardItem {
  return {
    id: 'fallback-object',
    type: 'object',
    createdAt: Date.now(),
    previewImage: 'mock://cat-object',
    maskImage: 'mock://cat-mask',
    bbox: { x: 0.3, y: 0.28, width: 0.4, height: 0.48 },
    spatial: { x: 0.5, y: 0.56, scale: 1, rotation: 0 },
  }
}

function getTypeLabel(type: ClipboardItem['type']): string {
  if (type === 'color') return '颜色'
  if (type === 'contour') return '轮廓'
  return '物体'
}
