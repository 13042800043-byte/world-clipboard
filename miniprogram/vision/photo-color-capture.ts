import type { ClipboardItem } from '../clipboard/clipboard-types'
import type { FinalPhoto } from './final-capture-controller'
import { sampleNeighborhoodColor } from './color-picker'

type ColorImage = { width: number; height: number; src?: string; onload?: () => void; onerror?: () => void }
type ColorCanvas = {
  width: number; height: number; createImage(): ColorImage
  getContext(type: '2d'): {
    drawImage(image: ColorImage, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
    getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray }
  }
}

/** Read a locked photo point locally; no upload, segmentation, or full-size canvas. */
export class PhotoColorCapture {
  constructor(private readonly createCanvas: () => ColorCanvas = () => {
    if (typeof wx.createOffscreenCanvas !== 'function') throw new Error('当前微信版本不支持本地取色，请升级微信')
    // Object-form 2D canvas API (base library >=2.16.1); never reuse the VK WebGL canvas/image.
    // https://developers.weixin.qq.com/miniprogram/dev/api/canvas/wx.createOffscreenCanvas.html
    // https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts
    return wx.createOffscreenCanvas({ type: '2d', width: 9, height: 9 })
  }) {}

  capture(photo: FinalPhoto): Promise<ClipboardItem> {
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (callback: () => void) => { if (!settled) { settled = true; clearTimeout(timeout); callback() } }
      const timeout = setTimeout(() => finish(() => reject(new Error('取色照片加载超时，请重新抓取'))), 5000)
      try {
        const canvas = this.createCanvas()
        const image = canvas.createImage()
        image.onerror = () => finish(() => reject(new Error('取色照片加载失败，请重新抓取')))
        image.onload = () => {
          if (settled) return
          try {
            const width = image.width, height = image.height
            if (![width, height].every(n => Number.isInteger(n) && n > 0)
              || ![photo.point.x, photo.point.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('取色照片坐标或尺寸无效')
            // FinalPhoto.point is already mapped into the photo, not the screen or drag endpoint.
            const cx = Math.round(photo.point.x * (width - 1)), cy = Math.round(photo.point.y * (height - 1))
            const left = Math.max(0, cx - 4), top = Math.max(0, cy - 4)
            const w = Math.min(width - 1, cx + 4) - left + 1, h = Math.min(height - 1, cy + 4) - top + 1
            canvas.width = w; canvas.height = h
            const context = canvas.getContext('2d')
            context.drawImage(image, left, top, w, h, 0, 0, w, h)
            const pixels = context.getImageData(0, 0, w, h).data
            if (!pixels || pixels.length !== w * h * 4 || !pixels.some((value, index) => index % 4 === 3 && value > 20)) throw new Error('无法读取有效颜色像素，请重新抓取')
            const color = sampleNeighborhoodColor(pixels, w, h, .5, .5, 4)
            const createdAt = Date.now()
            finish(() => resolve({ id: `color-${createdAt}`, type: 'color', createdAt, sourceFrame: photo.image, color,
              spatial: { ...photo.point, scale: 1, rotation: 0 } }))
          } catch (error) { finish(() => reject(error)) }
        }
        image.src = photo.image
      } catch (error) { finish(() => reject(error)) }
    })
  }
}
