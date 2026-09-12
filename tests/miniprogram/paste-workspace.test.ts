import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), cache: vi.fn(), save: vi.fn() }))
vi.mock('../../miniprogram/plugins/template-registry', () => ({ TEMPLATE_PLUGINS: Object.fromEntries(['sticker', 'pixel', 'lego', 'cross-stitch'].map(kind => [kind, { title: kind, defaults: { size: kind === 'cross-stitch' ? 48 : 32, maxColors: 16, border: 8 }, generate: mocks.generate }])) }))
vi.mock('../../miniprogram/plugins/template-media', () => ({ cacheTemplateAssets: mocks.cache, saveTemplateImage: mocks.save }))
let definition: any, component: any
const result = { kind: 'sticker', title: '贴纸', previewImage: 'data:image/png;base64,YQ==', chartImage: 'data:image/png;base64,Yg==', exportImage: 'data:image/png;base64,Yw==', previewLabel: '预览', chartLabel: '六枚排版', exportLabel: '透明 PNG', paletteLabel: '原图', metrics: [], materials: [], notes: [] }
const paths = { previewImage: 'wxfile://usr/preview.png', chartImage: 'wxfile://usr/chart.png', exportImage: 'wxfile://usr/export.png' }
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubGlobal('Component', (value: any) => { definition = value })
  vi.stubGlobal('wx', { showToast: vi.fn(), previewImage: vi.fn() })
  mocks.generate.mockResolvedValue(result); mocks.cache.mockResolvedValue(paths); mocks.save.mockResolvedValue(undefined)
  await import('../../miniprogram/components/paste-workspace/paste-workspace')
  component = { ...definition.methods, data: { ...definition.data, kind: 'sticker', item: { id: 'real', type: 'object', previewImage: result.previewImage } }, triggerEvent: vi.fn(), setData(update: any) { Object.assign(this.data, update) } }
  definition.lifetimes.attached.call(component)
  await vi.waitFor(() => expect(component.data.status).toBe('ready'))
})
afterEach(() => vi.unstubAllGlobals())
it('keeps PNG data out of setData and saves the transparent export, not checker preview', async () => {
  expect(JSON.stringify(component.data.result)).not.toContain('base64')
  expect(component.data.currentImage).toBe(paths.previewImage)
  await component.onSave({ currentTarget: { dataset: { asset: 'exportImage' } } })
  expect(mocks.save).toHaveBeenCalledWith(paths.exportImage)
  component.onView({ currentTarget: { dataset: { view: 'chart' } } })
  component.onPreview()
  expect(wx.previewImage).toHaveBeenCalledWith(expect.objectContaining({ current: paths.chartImage }))
})
it('discards responses after detach and regenerates interrupted requests on return', async () => {
  let resolve: any
  mocks.generate.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const pending = component.generate()
  definition.pageLifetimes.hide.call(component)
  resolve(result); await pending
  expect(component.data.status).toBe('loading')
  definition.pageLifetimes.show.call(component)
  await vi.waitFor(() => expect(component.data.status).toBe('ready'))
  mocks.generate.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const detached = component.generate()
  definition.lifetimes.detached.call(component)
  resolve(result); await detached
  expect(component.data.status).toBe('loading')
})
it('accepts only supported options and exposes save errors without getting stuck', async () => {
  await component.onOption({ currentTarget: { dataset: { setting: 'size', value: 64 } } })
  expect(mocks.generate).toHaveBeenLastCalledWith(component.data.item, expect.objectContaining({ size: 64 }))
  await component.onOption({ currentTarget: { dataset: { setting: 'size', value: 2048 } } })
  expect(mocks.generate).toHaveBeenCalledTimes(2)
  mocks.save.mockRejectedValueOnce(new Error('auth deny'))
  await component.onSave({ currentTarget: { dataset: { asset: 'chartImage' } } })
  expect(component.data.saving).toBe(false)
  expect(component.data.exportError).toContain('相册')
})
it('returns to the gallery and switches plugin via explicit events', () => {
  component.onClose()
  component.onPlugin({ currentTarget: { dataset: { kind: 'lego' } } })
  expect(component.triggerEvent).toHaveBeenCalledWith('close')
  expect(component.triggerEvent).toHaveBeenCalledWith('select', { id: 'lego' })
})
