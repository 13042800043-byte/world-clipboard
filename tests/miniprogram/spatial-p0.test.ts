import { describe, expect, it } from 'vitest'
import { CoordinateTransform, orientedDimensions } from '../../miniprogram/vision/coordinate-transform'
import { OneEuroFilter } from '../../miniprogram/vision/one-euro-filter'
import { SpatialController } from '../../miniprogram/interaction/spatial-controller'
import { createPinchTracker, updatePinchTracker } from '../../miniprogram/vision/gesture-engine'

describe('P0 coordinate contract', () => {
  it('maps cover crop into the original frame and roundtrips', () => {
    const transform = new CoordinateTransform({ viewWidth: 400, viewHeight: 800, frameWidth: 640, frameHeight: 480 })
    expect(transform.screenToFrame({ x: 0, y: 0 })).toEqual({ x: 0.3125, y: 0 })
    for (const point of [{ x: 0, y: 0 }, { x: 0.3, y: 0.7 }, { x: 1, y: 1 }]) {
      const mapped = transform.frameToScreen(transform.screenToFrame(point))
      expect(mapped.x).toBeCloseTo(point.x)
      expect(mapped.y).toBeCloseTo(point.y)
    }
  })
  it('handles mirror and quarter-turn rotation', () => {
    const transform = new CoordinateTransform({ viewWidth: 480, viewHeight: 640, frameWidth: 640, frameHeight: 480, rotation: 90, mirrorX: true })
    expect(transform.frameToScreen({ x: 0.2, y: 0.3 }).x).toBeCloseTo(0.3)
    expect(transform.frameToScreen({ x: 0.2, y: 0.3 }).y).toBeCloseTo(0.2)
    expect(transform.screenToFrame({ x: 0.3, y: 0.2 }).x).toBeCloseTo(0.2)
  })
  it('uses EXIF-oriented dimensions for the native photograph decoded by the backend', () => {
    expect(orientedDimensions({ width: 640, height: 480, orientation: 'right' })).toEqual({ width: 480, height: 640 })
    expect(orientedDimensions({ width: 640, height: 480, orientation: 'left-mirrored' })).toEqual({ width: 480, height: 640 })
    expect(orientedDimensions({ width: 640, height: 480, orientation: 'down' })).toEqual({ width: 640, height: 480 })
  })
  it('never crops an already rendered viewport screenshot a second time', () => {
    const transform = new CoordinateTransform({ viewWidth: 393, viewHeight: 852, frameWidth: 1179, frameHeight: 2556, source: 'viewport', mirrorX: true, rotation: 90 })
    expect(transform.screenToFrame({ x: 0.1, y: 0.8 })).toEqual({ x: 0.1, y: 0.8 })
  })
})

describe('P0 cursor filter', () => {
  it('suppresses stationary jitter and follows fast motion more than a fixed low-pass', () => {
    const adaptive = new OneEuroFilter({ minCutoff: 1.5, beta: 8, derivativeCutoff: 1 })
    const fixed = new OneEuroFilter({ minCutoff: 1.5, beta: 0, derivativeCutoff: 1 })
    adaptive.filter(0.5, 0); fixed.filter(0.5, 0)
    expect(Math.abs(adaptive.filter(0.502, 40) - 0.5)).toBeLessThan(0.002)
    fixed.filter(0.502, 40)
    expect(adaptive.filter(0.9, 80)).toBeGreaterThan(fixed.filter(0.9, 80))
  })
  it('ignores duplicate timestamps and can reset without carrying stale position', () => {
    const filter = new OneEuroFilter()
    expect(filter.filter(0.5, 10)).toBe(0.5)
    expect(filter.filter(0.9, 10)).toBe(0.5)
    filter.reset()
    expect(filter.filter(0.9, 20)).toBe(0.9)
  })
})

describe('P0 intent and gesture stability', () => {
  it('locks selection independently from the drag position and rejects duplicate starts', () => {
    const controller = new SpatialController()
    controller.start({ x: 0.4, y: 0.5 }, { x: 0.3, y: 0.5 })
    controller.move({ x: 0.8, y: 0.9 })
    controller.start({ x: 0.7, y: 0.7 })
    expect(controller.getSelectionPoint()).toEqual({ x: 0.3, y: 0.5 })
    expect(controller.getCursor()).toEqual({ x: 0.8, y: 0.9 })
    controller.getSelectionPoint().x = 0
    expect(controller.getSelectionPoint().x).toBe(0.3)
  })
  it('debounces three valid frames and ignores invalid distance rather than releasing', () => {
    let tracker = createPinchTracker()
    for (let frame = 0; frame < 2; frame++) {
      const result = updatePinchTracker(tracker, 0.2)
      expect(result.event).toBeUndefined(); tracker = result.tracker
    }
    const started = updatePinchTracker(tracker, 0.2)
    expect(started.event).toBe('PINCH_START')
    expect(updatePinchTracker(started.tracker, NaN).event).toBeUndefined()
    expect(updatePinchTracker(started.tracker, Infinity).event).toBeUndefined()
  })
})
