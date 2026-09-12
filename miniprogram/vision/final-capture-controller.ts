import { CoordinateTransform } from './coordinate-transform'
import { CUTOUT_CONFIG } from './cutout-config'
import type { NormalizedPoint } from './hand-tracker'

export type PromptBox = { x: number; y: number; width: number; height: number }
export type FinalCaptureInput = {
  point: NormalizedPoint
  box?: PromptBox
  negativePoints?: NormalizedPoint[]
  viewWidth: number
  viewHeight: number
}
export type FinalPhoto = {
  image: string; width: number; height: number; point: NormalizedPoint
  box?: PromptBox; negativePoints: NormalizedPoint[]; createdAt: number
}
export interface PhotoBridge {
  prepare?(): Promise<void>
  capturePhoto(): Promise<{ image: string; width: number; height: number }>
  restore?(): Promise<void>
}
export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

export class FinalCaptureController {
  constructor(private readonly bridge: PhotoBridge, private readonly sleep = delay) {}

  async capture(input: FinalCaptureInput): Promise<FinalPhoto> {
    try {
      await this.bridge.prepare?.()
      await this.sleep(CUTOUT_CONFIG.FINAL_CAPTURE_STABILITY_MS)
      const photo = await this.bridge.capturePhoto()
      const transform = new CoordinateTransform({ viewWidth: input.viewWidth, viewHeight: input.viewHeight,
        frameWidth: photo.width, frameHeight: photo.height, source: 'sensor' })
      const point = transform.screenToFrame(input.point)
      let box: PromptBox | undefined
      if (input.box) {
        const a = transform.screenToFrame(input.box)
        const b = transform.screenToFrame({ x: input.box.x + input.box.width, y: input.box.y + input.box.height })
        box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
      }
      return { ...photo, point, box, negativePoints: (input.negativePoints ?? []).map(p => transform.screenToFrame(p)), createdAt: Date.now() }
    } finally {
      await this.bridge.restore?.()
    }
  }
}
