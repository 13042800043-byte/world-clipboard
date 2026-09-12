import { describe, expect, it } from 'vitest'
import { shouldRenderSpatialFrame } from '../../miniprogram/interaction/spatial-render-scheduler'

describe('spatial render scheduler', () => {
  it('caps ordinary cursor updates while preserving gesture transitions', () => {
    expect(shouldRenderSpatialFrame(100, 120, 50, false)).toBe(false)
    expect(shouldRenderSpatialFrame(100, 150, 50, false)).toBe(true)
    expect(shouldRenderSpatialFrame(100, 110, 50, true)).toBe(true)
  })
})
