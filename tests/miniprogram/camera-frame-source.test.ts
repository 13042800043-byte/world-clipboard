import { describe, expect, it } from 'vitest'
import {
  WeChatCameraFrameSource,
  shouldAcceptCameraFrame,
  type CameraFrame,
} from '../../miniprogram/vision/camera-frame-source'

describe('camera frame throttling', () => {
  it('accepts the first frame and frames at the interval boundary', () => {
    expect(shouldAcceptCameraFrame(undefined, 1000, 120)).toBe(true)
    expect(shouldAcceptCameraFrame(1000, 1119, 120)).toBe(false)
    expect(shouldAcceptCameraFrame(1000, 1120, 120)).toBe(true)
  })

  it('starts, throttles and stops the native frame listener', () => {
    let callback: ((frame: CameraFrame) => void) | undefined
    let now = 1000
    let started = false
    let stopped = false
    const received: CameraFrame[] = []
    const frame = { data: new ArrayBuffer(4), width: 2, height: 2 }

    const source = new WeChatCameraFrameSource(
      () => ({
        onCameraFrame(handler) {
          callback = handler
          return {
            start() { started = true },
            stop() { stopped = true },
          }
        },
      }),
      120,
      () => now,
    )

    source.start((nextFrame) => received.push(nextFrame))
    callback?.(frame)
    now = 1080
    callback?.(frame)
    now = 1120
    callback?.(frame)
    source.stop()

    expect(started).toBe(true)
    expect(stopped).toBe(true)
    expect(received).toHaveLength(2)
  })
})
