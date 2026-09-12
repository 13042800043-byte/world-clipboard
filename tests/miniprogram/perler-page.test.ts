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
  it('requests a detailed MARD pattern and switches bead/chart previews', async () => {
    await page.onTemplateSelect({ detail: { id: 'perler' } })
    expect(mocks.generate).toHaveBeenCalledWith(expect.anything(), 48, { palette: 'mard221', style: 'cartoon', maxColors: 16, includePreviews: true })
    expect(page.data.perlerRows).toHaveLength(48)
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
})
