import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cameraWxml = readFileSync('miniprogram/pages/camera/camera.wxml', 'utf8')

describe('camera WXML interaction boundary', () => {
  it('keeps gesture listeners on a dedicated layer instead of the page root', () => {
    expect(cameraWxml).toMatch(/class="interaction-layer"[\s\S]*catchtouchstart="onTouchStart"/)
    expect(cameraWxml).not.toMatch(/<view\s+class="camera-page"[^>]*catchtouchstart/)
  })
})
