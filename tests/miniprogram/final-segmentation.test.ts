import { describe, it, expect, vi } from 'vitest'
import { FinalSegmentationController } from '../../miniprogram/vision/final-segmentation-controller'
import { VisionKitHandGestureAdapter } from '../../miniprogram/vision/visionkit-hand-tracker'

const photo = { image: 'high.jpg', width: 1600, height: 1200, point: { x: .5, y: .5 }, negativePoints: [], createdAt: 1 }
describe('final photo retry', () => {
  it('recaptures only once on blur, then surfaces failure', async () => {
    const segment = vi.fn(async () => { throw Object.assign(new Error('blur'), { code: 'BLURRY_CAPTURE' }) })
    const recapture = vi.fn(async () => ({ ...photo, image: 'retry.jpg' }))
    const controller = new FinalSegmentationController({ segment }, async () => {})
    await expect(controller.segment(photo, 'object', recapture)).rejects.toThrow('blur')
    expect(segment).toHaveBeenCalledTimes(2)
    expect(recapture).toHaveBeenCalledOnce()
    expect(segment.mock.calls[1][0].image).toBe('retry.jpg')
  })
  it('never retries unrelated errors', async () => {
    const recapture = vi.fn()
    const controller = new FinalSegmentationController({ segment: async () => { throw new Error('offline') } }, async () => {})
    await expect(controller.segment(photo, 'object', recapture)).rejects.toThrow('offline')
    expect(recapture).not.toHaveBeenCalled()
  })
})

it('preserves an intentional camera pause but still cancels genuine tracking loss', () => {
  const adapter = new VisionKitHandGestureAdapter()
  const anchor = (closed: boolean) => ({ points: Array.from({ length: 21 }, (_, i) => ({ x: i === 4 ? closed ? .48 : .2 : i === 8 ? .52 : i === 5 ? .3 : i === 17 ? .7 : .5, y: .5 })), origin: { x: .2, y: .2 }, size: { width: .6, height: .6 } })
  adapter.update(anchor(true), false, 100)
  expect(adapter.update(anchor(true), false, 180).pinch).toBe('PINCH_START')
  adapter.resumeAfterCapture(1000)
  expect(adapter.update(anchor(true), false, 1001).pinch).toBe('PINCH_HOLD')
  expect(adapter.update(undefined, false, 1300).tracking).toBe('grace')
  expect(adapter.update(undefined, false, 1302).tracking).toBe('lost')
})
