import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clipboardStore } from '../../miniprogram/clipboard/clipboard-store'

const mocks = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../../miniprogram/plugins/perler/perler-generator', () => ({ RemotePerlerGenerator: class { generate = mocks.generate } }))
let page: any
const result = { size: 48, cells: Array.from({ length: 48 * 48 }, (_, i) => ({ key: String(i), color: '#D30022', empty: false })), colors: [{ id: 'F15', name: 'MARD F15', hex: '#D30022', count: 48 * 48 }], totalBeads: 48 * 48, paletteId: 'mard221', paletteSize: 221, beadPreview: 'data:image/png;base64,YQ==', chartPreview: 'data:image/png;base64,Yg==' }

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers()
  vi.stubGlobal('Page', (definition: any) => { page = { ...definition, data: { ...definition.data }, setData(update: any) { Object.assign(this.data, update) } } })
  vi.stubGlobal('wx', { getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800 }), setNavigationBarColor: vi.fn(), pageScrollTo: vi.fn(), showToast: vi.fn(), previewImage: vi.fn(), env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ writeFile: (options: any) => options.success() }) })
  mocks.generate.mockResolvedValue(result)
  await import('../../miniprogram/pages/clipboard/clipboard')
  page.onShow()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clipboardStore.clear() })

describe('perler quality workspace', () => {
  it('switches to LEGO while perler is pending and prevents the old result from replacing it', async () => {
    let resolve: any
    mocks.generate.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const pending = page.onTemplateSelect({ detail: { id: 'perler' } })
    await page.onTemplateSelect({ detail: { id: 'lego' } })
    resolve(result); await pending
    expect(page.data.activeTemplate).toBe('lego')
    expect(page.data.showPerler).toBe(false)
    expect(page.data.perlerStatus).toBe('idle')
  })
  it.each(['sticker', 'pixel', 'lego', 'cross-stitch'])('opens the available %s workspace and preserves it across preview return', async id => {
    expect(page.data.templates.find((template: any) => template.id === id).disabled).toBe(false)
    await page.onTemplateSelect({ detail: { id } })
    expect(page.data.activeTemplate).toBe(id)
    expect(page.data.showPerler).toBe(false)
    page.onHide(); page.onShow()
    expect(page.data.activeTemplate).toBe(id)
    page.onPerlerExit()
    expect(page.data.activeTemplate).toBe('')
  })
  it('requests a detailed MARD pattern and switches bead/chart previews', async () => {
    await page.onTemplateSelect({ detail: { id: 'perler' } })
    expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), 64, { palette: 'mard221', style: 'realistic', maxColors: 16, includePreviews: true })
    expect(page.data.perlerRows).toHaveLength(48)
    vi.advanceTimersByTime(80)
    expect(wx.pageScrollTo).toHaveBeenCalledWith(expect.objectContaining({ scrollTop: 0 }))
    expect(page.data.perlerPreviewImage).toBe(result.beadPreview)
    page.onPerlerViewSelect({ currentTarget: { dataset: { mode: 'chart' } } })
    expect(page.data.perlerPreviewImage).toBe(result.chartPreview)
    await page.onPerlerPreview()
    expect(wx.previewImage).toHaveBeenCalledWith(expect.objectContaining({ current: 'wxfile://usr/world-clipboard-perler-chart.png' }))
    page.onHide()
    page.onShow()
    expect(page.data.showPerler).toBe(true)
    expect(page.data.perlerStatus).toBe('ready')
    expect(page.data.perlerView).toBe('chart')
  })
  it('regenerates at 64 cells and ignores an older response after leaving the page', async () => {
    await page.onPerlerOptionSelect({ currentTarget: { dataset: { setting: 'size', value: 64 } } })
    expect(mocks.generate.mock.calls[0][1]).toBe(64)
    let resolve: (value: any) => void = () => {}
    mocks.generate.mockReturnValue(new Promise(r => { resolve = r }))
    const pending = page.generatePerler()
    page.onHide()
    resolve(result)
    await pending
    expect(page.data.perlerStatus).not.toBe('ready')
  })
  it('returns from the focused perler workspace to template selection', async () => {
    await page.onTemplateSelect({ detail: { id: 'perler' } })
    page.onPerlerExit()
    expect(page.data.showPerler).toBe(false)
    expect(page.data.templates.every((template: any) => !template.active)).toBe(true)
  })
  it('can reopen the workspace after exiting during a pending generation', async () => {
    let resolve: (value: any) => void = () => {}
    mocks.generate.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const pending = page.onTemplateSelect({ detail: { id: 'perler' } })
    page.onPerlerExit()
    await page.onTemplateSelect({ detail: { id: 'perler' } })
    expect(mocks.generate).toHaveBeenCalledTimes(2)
    expect(page.data.showPerler).toBe(true)
    expect(page.data.perlerStatus).toBe('ready')
    resolve(result)
    await pending
    expect(page.data.perlerStatus).toBe('ready')
  })
})
