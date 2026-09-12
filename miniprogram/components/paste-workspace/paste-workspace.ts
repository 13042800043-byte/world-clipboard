import { TEMPLATE_PLUGINS } from '../../plugins/template-registry'
import { isTemplateKind } from '../../plugins/template-generator'
import { cacheTemplateAssets, saveTemplateImage } from '../../plugins/template-media'
import type { TemplateOptions } from '../../plugins/template-types'

Component({
  properties: { kind: String, item: Object },
  data: {
    title: '', status: 'idle', error: '', exportError: '', saving: false,
    options: { size: 32, maxColors: 16, border: 8 },
    sizes: [32, 48, 64], limits: [8, 16, 24], borders: [0, 8, 16],
    plugins: [{ id: 'sticker', label: '贴纸' }, { id: 'pixel', label: '像素画' }, { id: 'lego', label: '积木' }, { id: 'cross-stitch', label: '十字绣' }],
    view: 'preview', currentImage: '', assets: {}, result: null,
  },
  observers: {
    'kind,item': function () { if (this._alive) this.configure() },
  },
  lifetimes: {
    attached() { this._alive = true; this._visible = true; this._generation = 0; this.configure() },
    detached() { this._alive = false; this._generation++ },
  },
  pageLifetimes: {
    hide() { this._visible = false; this._generation++ },
    show() {
      this._visible = true
      // Returning from native preview must preserve the finished workspace.
      if (this._alive && this.data.status === 'loading') void this.generate()
    },
  },
  methods: {
    configure() {
      const kind = this.data.kind
      if (!isTemplateKind(kind)) return
      if (this._kind !== kind) {
        this._kind = kind
        this.setData({ title: TEMPLATE_PLUGINS[kind].title, options: { ...TEMPLATE_PLUGINS[kind].defaults }, view: 'preview' })
      }
      void this.generate()
    },
    async generate() {
      const kind = this.data.kind
      if (!isTemplateKind(kind) || !this._alive || !this._visible) return
      const generation = ++this._generation
      const isCurrent = () => this._alive && this._visible && generation === this._generation
      this.setData({ status: 'loading', error: '', exportError: '', currentImage: '', result: null, assets: {} })
      try {
        const result = await TEMPLATE_PLUGINS[kind].generate(this.data.item, { ...this.data.options } as TemplateOptions)
        if (!isCurrent()) return
        const assets = await cacheTemplateAssets(kind, result, isCurrent)
        if (!assets || !isCurrent()) return
        // PNG payloads stay off the native setData bridge; only small metadata and paths cross it.
        const { previewImage, chartImage, exportImage, ...metadata } = result
        this.setData({ result: metadata, assets, currentImage: this.data.view === 'chart' ? assets.chartImage : assets.previewImage, status: 'ready' })
      } catch (error) {
        if (!isCurrent()) return
        const message = error instanceof Error && error.message === '请先完成真实物体抠图'
          ? error.message : '生成失败，请确认视觉后端已更新并可访问'
        this.setData({ status: 'error', error: message })
      }
    },
    async onOption(event) {
      if (this.data.status === 'loading' || this.data.saving) return
      const { setting, value } = event.currentTarget.dataset
      const options = { ...this.data.options }
      const allowed = setting === 'size' ? [32, 48, 64] : setting === 'maxColors' ? [8, 16, 24] : setting === 'border' ? [0, 8, 16] : []
      if (!allowed.includes(Number(value))) return
      options[setting] = Number(value)
      this.setData({ options })
      await this.generate()
    },
    onView(event) {
      const view = event.currentTarget.dataset.view
      if (!['preview', 'chart'].includes(view) || this.data.status !== 'ready') return
      this.setData({ view, currentImage: view === 'chart' ? this.data.assets.chartImage : this.data.assets.previewImage })
    },
    onPreview() {
      const path = this.data.currentImage
      if (path) wx.previewImage({ current: path, urls: [path], fail: () => wx.showToast({ title: '图片打开失败，请重试', icon: 'none' }) })
    },
    async onSave(event) {
      const asset = event.currentTarget.dataset.asset
      if (!['exportImage', 'chartImage'].includes(asset) || this.data.saving || this.data.status !== 'ready') return
      const path = this.data.assets[asset]
      if (!path) return
      this.setData({ saving: true, exportError: '' })
      try {
        await saveTemplateImage(path)
        if (this._alive) wx.showToast({ title: '已保存到相册', icon: 'success' })
      } catch {
        if (this._alive) this.setData({ exportError: '保存失败。如拒绝授权，请在小程序设置中允许保存到相册；也可放大图片后长按保存。' })
      } finally {
        if (this._alive) this.setData({ saving: false })
      }
    },
    onClose() { if (!this.data.saving) this.triggerEvent('close') },
    onPlugin(event) {
      const kind = event.currentTarget.dataset.kind
      if (isTemplateKind(kind) && kind !== this.data.kind && !this.data.saving) this.triggerEvent('select', { id: kind })
    },
  },
})
