import type { NormalizedPoint } from './hand-tracker'

export interface CoordinateOptions {
  viewWidth: number
  viewHeight: number
  frameWidth: number
  frameHeight: number
  source?: 'sensor' | 'viewport'
  rotation?: 0 | 90 | 180 | 270
  mirrorX?: boolean
}

// wx.getImageInfo dimensions ignore EXIF orientation; the image renderer and
// OpenCV IMREAD_COLOR apply it. Map to the oriented image, not the stored JPEG axes.
export function orientedDimensions(info: { width: number; height: number; orientation?: string }): { width: number; height: number } {
  const swap = info.orientation?.startsWith('left') || info.orientation?.startsWith('right')
  return swap ? { width: info.height, height: info.width } : { width: info.width, height: info.height }
}

/** Normalized screen ↔ uploaded image. Sensor preview uses centered aspect-fill.
 * WebGL exports already include displayTransform: never crop/rotate/mirror twice.
 */
export class CoordinateTransform {
  private readonly scale: number
  private readonly cropX: number
  private readonly cropY: number
  private readonly width: number
  private readonly height: number

  constructor(private readonly options: CoordinateOptions) {
    if (![options.viewWidth, options.viewHeight, options.frameWidth, options.frameHeight].every(value => Number.isFinite(value) && value > 0)) {
      throw new Error('坐标映射需要有效的画面尺寸')
    }
    const swap = options.rotation === 90 || options.rotation === 270
    this.width = swap ? options.frameHeight : options.frameWidth
    this.height = swap ? options.frameWidth : options.frameHeight
    this.scale = Math.max(options.viewWidth / this.width, options.viewHeight / this.height)
    this.cropX = (this.width * this.scale - options.viewWidth) / 2
    this.cropY = (this.height * this.scale - options.viewHeight) / 2
  }

  screenToFrame(point: NormalizedPoint): NormalizedPoint {
    if (this.options.source === 'viewport') return { ...point }
    let x = (point.x * this.options.viewWidth + this.cropX) / (this.width * this.scale)
    const y = (point.y * this.options.viewHeight + this.cropY) / (this.height * this.scale)
    if (this.options.mirrorX) x = 1 - x
    switch (this.options.rotation) {
      case 90: return { x: y, y: 1 - x }
      case 180: return { x: 1 - x, y: 1 - y }
      case 270: return { x: 1 - y, y: x }
      default: return { x, y }
    }
  }

  frameToScreen(point: NormalizedPoint): NormalizedPoint {
    if (this.options.source === 'viewport') return { ...point }
    let rotated = { ...point }
    switch (this.options.rotation) {
      case 90: rotated = { x: 1 - point.y, y: point.x }; break
      case 180: rotated = { x: 1 - point.x, y: 1 - point.y }; break
      case 270: rotated = { x: point.y, y: 1 - point.x }; break
    }
    if (this.options.mirrorX) rotated.x = 1 - rotated.x
    return {
      x: (rotated.x * this.width * this.scale - this.cropX) / this.options.viewWidth,
      y: (rotated.y * this.height * this.scale - this.cropY) / this.options.viewHeight,
    }
  }
}
