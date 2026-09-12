import { afterEach, describe, expect, it, vi } from 'vitest'
import { cacheTemplateAssets, saveTemplateImage } from '../../miniprogram/plugins/template-media'
afterEach(() => vi.unstubAllGlobals())
describe('native template exports', () => {
  it('recovers its bounded file queue after a failed write', async () => {
    let fail = true
    vi.stubGlobal('wx', { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ writeFile: (options: any) => fail ? options.fail(new Error('disk')) : options.success() }) })
    const images = { previewImage: 'data:image/png;base64,YQ==', chartImage: 'data:image/png;base64,Yg==', exportImage: 'data:image/png;base64,Yw==' }
    await expect(cacheTemplateAssets('pixel', images, () => true)).rejects.toThrow('disk')
    fail = false
    expect(await cacheTemplateAssets('pixel', images, () => true)).toHaveProperty('exportImage')
  })
  it('keeps base64 out of page data and writes separate preview/export files', async () => {
    const writeFile = vi.fn((options: any) => options.success())
    const save = vi.fn((options: any) => options.success())
    vi.stubGlobal('wx', { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ writeFile }), saveImageToPhotosAlbum: save })
    const assets = await cacheTemplateAssets('sticker', { previewImage: 'data:image/png;base64,YQ==', chartImage: 'data:image/png;base64,Yg==', exportImage: 'data:image/png;base64,Yw==' }, () => true)
    expect(assets.exportImage).toBe('wxfile://usr/world-clipboard-sticker-exportImage.png')
    expect(writeFile.mock.calls[2][0].data).toBe('Yw==')
    await saveTemplateImage(assets.exportImage)
    expect(save.mock.calls[0][0].filePath).toBe(assets.exportImage)
  })
  it('does not write or export an expired request', async () => {
    const writeFile = vi.fn()
    vi.stubGlobal('wx', { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ writeFile }) })
    expect(await cacheTemplateAssets('lego', { previewImage: 'a', chartImage: 'b', exportImage: 'c' }, () => false)).toBeUndefined()
    expect(writeFile).not.toHaveBeenCalled()
  })
  it('rejects denied album permissions so the UI can explain recovery', async () => {
    vi.stubGlobal('wx', { saveImageToPhotosAlbum: (options: any) => options.fail({ errMsg: 'auth deny' }) })
    await expect(saveTemplateImage('wxfile://usr/template.png')).rejects.toEqual({ errMsg: 'auth deny' })
  })
})
