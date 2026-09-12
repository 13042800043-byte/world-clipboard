import { describe, expect, it, vi } from 'vitest'
import { PhotoColorCapture } from '../../miniprogram/vision/photo-color-capture'

const photo = { image: 'tmp://photo.jpg', width: 100, height: 200, point: { x: .5, y: .5 }, negativePoints: [], createdAt: 1 }
function canvasFor(pixels: Uint8ClampedArray, width = 100, height = 200) {
  const context = { drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: pixels })) }
  const image: any = { width, height, onload: undefined, onerror: undefined, set src(_src) { this.onload() } }
  return { width: 9, height: 9, getContext: () => context, createImage: () => image, context }
}
describe('local photo neighborhood color', () => {
  it('trims outliers across a real 9×9 photo region and returns a color ClipboardItem', async () => {
    const pixels = new Uint8ClampedArray(Array.from({ length: 81 }, (_, i) => i < 5 ? [0, 0, 0, 255] : i > 75 ? [255, 255, 255, 255] : [215, 106, 66, 255]).flat())
    const canvas = canvasFor(pixels)
    expect(await new PhotoColorCapture(() => canvas).capture(photo)).toMatchObject({ type: 'color', sourceFrame: photo.image, color: { hex: '#D76A42', rgb: [215, 106, 66] } })
    expect(canvas.context.drawImage).toHaveBeenCalledWith(expect.anything(), 46, 96, 9, 9, 0, 0, 9, 9)
  })
  it('clips the neighborhood at the photo edge instead of stretching or reading out of bounds', async () => {
    const canvas = canvasFor(new Uint8ClampedArray(Array.from({ length: 25 }, () => [12, 34, 56, 255]).flat()))
    expect((await new PhotoColorCapture(() => canvas).capture({ ...photo, point: { x: 1, y: 0 } })).color.hex).toBe('#0C2238')
    expect(canvas.context.drawImage).toHaveBeenCalledWith(expect.anything(), 95, 0, 5, 5, 0, 0, 5, 5)
  })
  it('rejects empty/invalid canvas pixels instead of silently manufacturing black', async () => {
    await expect(new PhotoColorCapture(() => canvasFor(new Uint8ClampedArray(81 * 4))).capture(photo)).rejects.toThrow('颜色像素')
  })
  it('bounds a missing image callback and ignores a late load', async () => {
    vi.useFakeTimers()
    let image: any
    const canvas: any = { width: 9, height: 9, createImage: () => (image = { width: 100, height: 200 }), getContext: vi.fn() }
    try {
      const pending = new PhotoColorCapture(() => canvas).capture(photo)
      const assertion = expect(pending).rejects.toThrow('取色照片加载超时')
      await vi.advanceTimersByTimeAsync(5001); await assertion
      image.onload()
      expect(canvas.getContext).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })
})
