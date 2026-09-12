import { describe, expect, it } from 'vitest'
import { VisionKitHandGestureAdapter, type VisionKitHandAnchor } from '../../miniprogram/vision/visionkit-hand-tracker'

function anchor(distance: number): VisionKitHandAnchor {
  return {
    points: Array.from({ length: 21 }, (_, i) => ({ x: i === 4 ? .5 - distance * .4 : i === 5 ? .3 : i === 17 ? .7 : .5, y: .5 })),
    origin: { x: .2, y: .2 }, size: { width: .6, height: .6 },
  }
}

describe('responsive pinch with anti-jitter guards', () => {
  it('confirms ordinary closing fingers in two separate observations but not one noisy frame', () => {
    const adapter = new VisionKitHandGestureAdapter()
    expect(adapter.update(anchor(.30), false, 0).pinch).toBeUndefined()
    expect(adapter.update(anchor(.30), false, 40).pinch).toBe('PINCH_START')
    expect(adapter.update(anchor(.38), false, 80).pinch).toBe('PINCH_HOLD')
    expect(adapter.update(anchor(.7), false, 120).pinch).toBe('PINCH_HOLD')
    expect(adapter.update(anchor(.7), false, 160).pinch).toBe('PINCH_END')
  })

  it('does not start from duplicate observations or an isolated closing spike', () => {
    const adapter = new VisionKitHandGestureAdapter()
    for (let i = 0; i < 5; i++) expect(adapter.update(anchor(.1), false, 0).pinch).toBeUndefined()
    expect(adapter.update(anchor(.8), false, 40).pinch).toBeUndefined()
    expect(adapter.update(anchor(.1), false, 80).pinch).toBeUndefined()
    expect(adapter.update(anchor(.8), false, 120).pinch).toBeUndefined()
  })
})
