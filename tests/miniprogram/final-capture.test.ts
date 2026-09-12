import { describe, expect, it, vi } from 'vitest'
import { FinalCaptureController } from '../../miniprogram/vision/final-capture-controller'
import { buildHandNegativePrompt } from '../../miniprogram/vision/hand-negative-prompt'

describe('high quality final capture', () => {
  it('uses high photo dimensions for both locked point and candidate box', async () => {
    const photo = vi.fn(async () => ({ image: 'high.jpg', width: 1600, height: 1200 }))
    const controller = new FinalCaptureController({ capturePhoto: photo }, async () => {})
    const result = await controller.capture({ point: { x: 0.2, y: 0.4 }, box: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 }, negativePoints: [], viewWidth: 400, viewHeight: 800 })
    expect(result.point.x).toBeCloseTo(0.3875)
    expect(result.box?.x).toBeCloseTo(0.35)
    expect(result.box?.width).toBeCloseTo(0.15)
    expect(result.width).toBe(1600)
    expect(result.image).toBe('high.jpg')
  })
  it('always releases camera ownership even on photo failure', async () => {
    const restore = vi.fn(async () => {})
    const controller = new FinalCaptureController({ prepare: async () => {}, capturePhoto: async () => { throw new Error('takePhoto fail') }, restore }, async () => {})
    await expect(controller.capture({ point: { x: .5, y: .5 }, viewWidth: 400, viewHeight: 800 })).rejects.toThrow('takePhoto fail')
    expect(restore).toHaveBeenCalledOnce()
  })
  it('uses hand region negatives but excludes the positive point and protected target box', () => {
    const points = Array.from({ length: 21 }, (_, index) => ({ x: index < 6 ? .2 : .5, y: .5, z: 0 }))
    const negatives = buildHandNegativePrompt(points, { x: .5, y: .5 }, { x: .4, y: .4, width: .2, height: .2 })
    expect(negatives.length).toBeGreaterThan(0)
    expect(negatives.every(point => point.x < .4)).toBe(true)
  })
})
