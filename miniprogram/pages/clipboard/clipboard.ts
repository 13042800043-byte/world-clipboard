import { clipboardStore } from '../../clipboard/clipboard-store'
import type { ClipboardItem } from '../../clipboard/clipboard-types'
import { APP_CONFIG } from '../../config'
import { getDeviceLayout } from '../../utils/device-layout'
import { RemotePerlerGenerator } from '../../plugins/perler/perler-generator'
import { buildPerlerRows, type PerlerRow } from '../../plugins/perler/perler-layout'
import type { PerlerOptions } from '../../plugins/perler/perler-types'
import { isTemplateKind } from '../../plugins/template-generator'

const perlerGenerator = new RemotePerlerGenerator(APP_CONFIG.VISION_API_BASE_URL)
let perlerGeneration = 0
let previewWriteQueue: Promise<void> = Promise.resolve()

const templates = [
  { id: 'perler', label: '拼豆模板', active: false, disabled: false, widthClass: 'third' },
  { id: 'sticker', label: '贴纸', active: false, disabled: false, widthClass: 'third' },
  { id: 'pixel', label: '像素画', active: false, disabled: false, widthClass: 'third' },
  { id: 'lego', label: 'LEGO 模板', active: false, disabled: false, widthClass: 'half' },
  { id: 'cross-stitch', label: '十字绣', active: false, disabled: false, widthClass: 'half' },
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
    activeTemplate: '',
    showPerler: false,
    perlerStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    perlerError: '',
    perlerRows: [] as PerlerRow[],
    perlerSettings: { size: 64, palette: 'mard221', style: 'realistic', maxColors: 16 },
    perlerSizes: [32, 48, 64],
    perlerLimits: [8, 16, 24],
    perlerStyles: [{ id: 'cartoon', label: '色块简化' }, { id: 'realistic', label: '线条保留' }],
    perlerView: 'beads',
    perlerPreviewImage: '',
    paletteLabel: '',
    previewOpening: false,
    perler: {
      size: 32,
      cells: [],
      colors: [],
      totalBeads: 0,
    },
  },

  onShow() {
    perlerGeneration++
    this.setData(getDeviceLayout())
    wx.setNavigationBarColor?.({ frontColor: '#000000', backgroundColor: '#f6f7f9' })
    const item = clipboardStore.get() || createFallbackItem()
    if (this.data.item.id === item.id && (this.data.showPerler || this.data.activeTemplate)) {
      this.setData({ previewOpening: false })
      if (this.data.showPerler && this.data.perlerStatus === 'loading') void this.generatePerler()
      return
    }
    const color = item.color || { hex: '#6E747A', rgb: [110, 116, 122] as [number, number, number] }
    this.setData({
      item,
      typeLabel: getTypeLabel(item.type),
      colorHex: color.hex,
      rgbText: color.rgb.join(', '),
      previewImage: getRealPreview(item.previewImage),
      showPerler: false,
      activeTemplate: '',
      perlerStatus: 'idle',
      perlerError: '',
      perlerRows: [],
      perlerPreviewImage: '',
      paletteLabel: '',
      previewOpening: false,
      templates: templates.map((template) => ({ ...template, active: false })),
    })
  },

  onHide() { perlerGeneration++ },
  onUnload() { perlerGeneration++ },

  onBack() {
    wx.navigateBack({ delta: 1 })
  },

  onPerlerExit() {
    perlerGeneration++
    this.setData({ showPerler: false, activeTemplate: '', perlerStatus: 'idle', previewOpening: false, templates: templates.map(template => ({ ...template, active: false })) })
    wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },

  async onTemplateSelect(event: { detail: { id: string } }) {
    const id = event.detail.id
    if (isTemplateKind(id)) {
      perlerGeneration++
      this.setData({ activeTemplate: id, showPerler: false, perlerStatus: 'idle', previewOpening: false,
        templates: templates.map(template => ({ ...template, active: template.id === id })) })
      wx.pageScrollTo({ scrollTop: 0, duration: 200 })
      return
    }
    if (event.detail.id !== 'perler' || this.data.perlerStatus === 'loading') return
    this.setData({
      activeTemplate: '',
      showPerler: true,
      perlerStatus: 'loading',
      perlerError: '',
      perlerRows: [],
      templates: templates.map((template) => ({
        ...template,
        active: template.id === 'perler',
      })),
    })
    const scrollGeneration = perlerGeneration + 1
    setTimeout(() => { if (scrollGeneration === perlerGeneration) wx.pageScrollTo({ scrollTop: 0, duration: 200 }) }, 80)
    await this.generatePerler()
  },

  async onPerlerOptionSelect(event: { currentTarget: { dataset: { setting: string; value: string | number } } }) {
    if (this.data.perlerStatus === 'loading') return
    const { setting, value } = event.currentTarget.dataset
    const settings = { ...this.data.perlerSettings }
    if (setting === 'size' && [32, 48, 64].includes(Number(value))) settings.size = Number(value)
    else if (setting === 'maxColors' && [8, 16, 24].includes(Number(value))) settings.maxColors = Number(value)
    else if (setting === 'style' && ['cartoon', 'realistic'].includes(String(value))) settings.style = String(value)
    else return
    this.setData({ perlerSettings: settings })
    await this.generatePerler()
  },

  onPerlerViewSelect(event: { currentTarget: { dataset: { mode: string } } }) {
    const mode = event.currentTarget.dataset.mode
    if (mode !== 'beads' && mode !== 'chart') return
    this.setData({ perlerView: mode, perlerPreviewImage: (mode === 'beads' ? this.data.perler.beadPreview : this.data.perler.chartPreview) || '' })
  },

  async onPerlerPreview() {
    const image = this.data.perlerPreviewImage
    if (!image || this.data.previewOpening) return
    const generation = perlerGeneration
    const mode = this.data.perlerView
    const filePath = `${wx.env.USER_DATA_PATH}/world-clipboard-perler-${mode}.png`
    this.setData({ previewOpening: true })
    // Reuse two app-owned files; serialize writes across repeated page visits.
    const operation = previewWriteQueue.then(() => new Promise<void>((resolve, reject) => wx.getFileSystemManager().writeFile({
      filePath, data: image.slice('data:image/png;base64,'.length), encoding: 'base64', success: resolve, fail: reject,
    })))
    previewWriteQueue = operation.then(() => undefined, () => undefined)
    try {
      await operation
      if (generation === perlerGeneration) wx.previewImage({ current: filePath, urls: [filePath], fail: () => wx.showToast({ title: '图纸打开失败，请重试', icon: 'none' }) })
    } catch {
      if (generation === perlerGeneration) wx.showToast({ title: '图纸打开失败，请重试', icon: 'none' })
    } finally {
      if (generation === perlerGeneration) this.setData({ previewOpening: false })
    }
  },

  async generatePerler() {
    const generation = ++perlerGeneration
    const settings = this.data.perlerSettings
    this.setData({ perlerStatus: 'loading', perlerError: '', perlerRows: [], perlerPreviewImage: '' })

    try {
      const perler = await perlerGenerator.generate(this.data.item, settings.size, {
        palette: settings.palette, style: settings.style, maxColors: settings.maxColors, includePreviews: true,
      } as PerlerOptions)
      if (generation !== perlerGeneration) return
      this.setData({ perler, perlerRows: buildPerlerRows(perler), perlerStatus: 'ready',
        paletteLabel: perler.paletteId?.startsWith('mard') ? `MARD · ${perler.paletteSize} 色卡` : '旧版色卡 · 请更新后端',
        perlerPreviewImage: (this.data.perlerView === 'beads' ? perler.beadPreview : perler.chartPreview) || '' })
    } catch (error) {
      if (generation !== perlerGeneration) return
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
