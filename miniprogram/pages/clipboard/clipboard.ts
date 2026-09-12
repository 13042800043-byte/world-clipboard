import { clipboardStore } from '../../clipboard/clipboard-store'
import type { ClipboardItem } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { getDeviceLayout } from '../../utils/device-layout'
import { RemotePerlerGenerator } from '../../plugins/perler/perler-generator'
import { buildPerlerRows, type PerlerRow } from '../../plugins/perler/perler-layout'

const perlerGenerator = new RemotePerlerGenerator(APP_CONFIG.VISION_API_BASE_URL)

const templates = [
  { id: 'perler', label: '拼豆模板', active: false, disabled: false, widthClass: 'third' },
  { id: 'sticker', label: '贴纸', active: false, disabled: true, widthClass: 'third' },
  { id: 'pixel', label: '像素画', active: false, disabled: true, widthClass: 'third' },
  { id: 'lego', label: 'LEGO 模板', active: false, disabled: true, widthClass: 'half' },
  { id: 'cross-stitch', label: '十字绣', active: false, disabled: true, widthClass: 'half' },
]

Page({
  data: {
    navTop: 24,
    navHeight: 68,
    navRightInset: 106,
    bottomInset: 0,
    item: createFallbackItem(),
    typeLabel: '物体',
    colorHex: '#6E747A',
    rgbText: '110, 116, 122',
    previewImage: '',
    templates,
    showPerler: false,
    perlerStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    perlerError: '',
    perlerRows: [] as PerlerRow[],
    perler: {
      size: 32,
      cells: [],
      colors: [],
      totalBeads: 0,
    },
  },

  onShow() {
    this.setData(getDeviceLayout())
    wx.setNavigationBarColor?.({ frontColor: '#000000', backgroundColor: '#f6f7f9' })
    const item = clipboardStore.get() || createFallbackItem()
    const color = item.color || { hex: '#6E747A', rgb: [110, 116, 122] as [number, number, number] }
    this.setData({
      item,
      typeLabel: getTypeLabel(item.type),
      colorHex: color.hex,
      rgbText: color.rgb.join(', '),
      previewImage: getRealPreview(item.previewImage),
      showPerler: false,
      perlerStatus: 'idle',
      perlerError: '',
      perlerRows: [],
      templates: templates.map((template) => ({ ...template, active: false })),
    })
  },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  async onTemplateSelect(event: { detail: { id: string } }) {
    if (event.detail.id !== 'perler') return
    this.setData({
      showPerler: true,
      perlerStatus: 'loading',
      perlerError: '',
      perlerRows: [],
      templates: templates.map((template) => ({
        ...template,
        active: template.id === 'perler',
      })),
    })
    setTimeout(() => wx.pageScrollTo({ selector: '#perler-result', duration: 360 }), 80)

    try {
      const perler = await perlerGenerator.generate(this.data.item, 32)
      this.setData({ perler, perlerRows: buildPerlerRows(perler), perlerStatus: 'ready' })
    } catch (error) {
      const perlerError = error instanceof Error && error.message === '请先完成真实物体抠图'
        ? error.message
        : '拼豆生成失败 · 请检查视觉后端'
      this.setData({ perlerStatus: 'error', perlerError })
      wx.showToast({ title: perlerError, icon: 'none', duration: 2600 })
    }
  },
})

function createFallbackItem(): ClipboardItem {
  return {
    id: 'fallback-object',
    type: 'object',
    createdAt: Date.now(),
    spatial: { x: 0.5, y: 0.56, scale: 1, rotation: 0 },
  }
}

function getTypeLabel(type: ClipboardItem['type']): string {
  if (type === 'color') return '颜色'
  if (type === 'contour') return '轮廓'
  return '物体'
}

function getRealPreview(previewImage?: string): string {
  return previewImage?.startsWith('data:image/png;base64,') ? previewImage : ''
}
