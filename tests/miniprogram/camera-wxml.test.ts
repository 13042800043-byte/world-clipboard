import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cameraWxml = readFileSync('miniprogram/pages/camera/camera.wxml', 'utf8')
const cameraSource = readFileSync('miniprogram/pages/camera/camera.ts', 'utf8')

describe('camera WXML interaction boundary', () => {
  it('keeps gesture listeners on a dedicated layer instead of the page root', () => {
    expect(cameraWxml).toMatch(/class="interaction-layer"[\s\S]*catchtouchstart="onTouchStart"/)
    expect(cameraWxml).not.toMatch(/<view\s+class="camera-page"[^>]*catchtouchstart/)
  })

  it('uses a WebGL camera surface for VisionKit with a native camera fallback', () => {
    expect(cameraWxml).toMatch(/<canvas[\s\S]*type="webgl"[\s\S]*id="visionkit-canvas"/)
    expect(cameraWxml).toMatch(/<camera[\s\S]*bindinitdone="onCameraReady"/)
  })

  it('uses a neutral spatial selection reticle instead of a fake animal', () => {
    expect(cameraWxml).toContain('selection-reticle')
    expect(cameraWxml).not.toContain('cat-')
    expect(cameraWxml).not.toContain('模拟目标')
  })

  it('keeps real segmentation failures on the camera page', () => {
    expect(cameraSource).not.toContain('FallbackSegmentationAdapter')
    expect(cameraSource).toContain('真实抠图失败')
  })
})
