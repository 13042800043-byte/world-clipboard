import type { TemplateKind } from './template-types'
import { isPngDataUrl, isTemplateKind } from './template-generator'

type Assets = { previewImage: string; chartImage: string; exportImage: string }
let writeQueue: Promise<unknown> = Promise.resolve()

export function cacheTemplateAssets(kind: TemplateKind, assets: Assets, isCurrent: () => boolean): Promise<Assets | undefined> {
  const operation = writeQueue.then(async () => {
    if (!isCurrent()) return undefined
    if (!isTemplateKind(kind)) throw new Error('unknown template')
    const paths = {} as Assets
    // Twelve fixed app-owned files, not unbounded captures. Native page data
    // receives paths/metadata only, never three potentially large base64 PNGs.
    for (const field of ['previewImage', 'chartImage', 'exportImage'] as const) {
      if (!isCurrent()) return undefined
      const image = assets[field]
      if (!isPngDataUrl(image)) throw new Error('invalid template image')
      const filePath = `${wx.env.USER_DATA_PATH}/world-clipboard-${kind}-${field}.png`
      await new Promise<void>((resolve, reject) => wx.getFileSystemManager().writeFile({
        filePath, data: image.slice('data:image/png;base64,'.length), encoding: 'base64', success: resolve, fail: reject,
      }))
      paths[field] = filePath
    }
    return isCurrent() ? paths : undefined
  })
  writeQueue = operation.then(() => undefined, () => undefined)
  return operation
}

// Called only by an explicit user save action. WeChat owns the permission prompt.
export function saveTemplateImage(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => wx.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject }))
}
