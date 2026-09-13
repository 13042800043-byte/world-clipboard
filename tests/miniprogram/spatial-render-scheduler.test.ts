import { describe, expect, it } from 'vitest'
import { shouldRenderSpatialFrame, advanceSpatialRenderClock } from '../../miniprogram/interaction/spatial-render-scheduler'

describe('spatial render scheduler', () => {
  it('caps ordinary cursor updates while preserving gesture transitions', () => {
    expect(shouldRenderSpatialFrame(100, 120, 50, false)).toBe(false)
    expect(shouldRenderSpatialFrame(100, 150, 50, false)).toBe(true)
    expect(shouldRenderSpatialFrame(100, 110, 50, true)).toBe(true)
  })
  it('does not turn 20 UI FPS into 12 FPS when hand observations arrive at 24 FPS', () => {
    let clock = 0, count = 0
    for (let i = 1; i <= 240; i++) {
      const now = i * 1000 / 24
      if (!shouldRenderSpatialFrame(clock, now, 50, false)) continue
      count++
      clock = advanceSpatialRenderClock(clock, now, 50, false)
    }
    expect(count).toBeGreaterThanOrEqual(199)
    expect(count).toBeLessThanOrEqual(200)
    expect(advanceSpatialRenderClock(100, 110, 50, true)).toBe(110)
  })
})
