import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cameraWxml = readFileSync('miniprogram/pages/camera/camera.wxml', 'utf8')
const cameraSource = readFileSync('miniprogram/pages/camera/camera.ts', 'utf8')
const cameraStyle = readFileSync('miniprogram/pages/camera/camera.wxss', 'utf8')
const cursorStyle = readFileSync('miniprogram/components/spatial-cursor/spatial-cursor.wxss', 'utf8')

describe('camera WXML interaction boundary', () => {
  it('shows mapped prompts on an uncropped captured frame in coordinate debug mode', () => {
    expect(cameraWxml).toContain('coordinateDebug')
    expect(cameraWxml).toContain('framePointX * 100')
    expect(cameraWxml).toContain('mode="scaleToFill"')
  })
  it('does not add positional easing lag to filtered cursor or dragged reticle', () => {
    expect(cursorStyle).not.toMatch(/transition:[^;]*\bleft\b/)
    const grabbed = cameraStyle.match(/\.captured--grabbed\s*\{([^}]+)\}/)?.[1]
    expect(grabbed).toContain('transition: transform')
    expect(grabbed).not.toMatch(/transition:[^;]*\bleft\b/)
  })
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

  it('never replaces a failed real frame export with a fake upload path', () => {
    expect(cameraSource).not.toContain("'camera://latest-frame'")
    expect(cameraSource).not.toContain("'mock://camera-frame'")
  })
})
