import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clipboardWxml = readFileSync('miniprogram/pages/clipboard/clipboard.wxml', 'utf8')
const previewWxml = readFileSync('miniprogram/components/object-preview/object-preview.wxml', 'utf8')
const clipboardSource = readFileSync('miniprogram/pages/clipboard/clipboard.ts', 'utf8')
const clipboardStyle = readFileSync('miniprogram/pages/clipboard/clipboard.wxss', 'utf8')

describe('clipboard captured image rendering', () => {
  it('focuses the workspace on the source and pattern instead of the full plugin gallery', () => {
    expect(clipboardWxml).toMatch(/<view wx:if="{{!showPerler}}" class="hero"/)
    expect(clipboardWxml).toMatch(/<view wx:if="{{!showPerler}}" class="templates-section"/)
    expect(clipboardWxml).toContain('perler-source')
    expect(clipboardWxml).toContain('onPerlerExit')
    expect(clipboardWxml).not.toContain('小字建议 64 格')
    expect(clipboardStyle).toMatch(/\.nav\s*\{[^}]*position:\s*sticky/)
  })
  it('provides size/style controls and native high-resolution preview with row fallback', () => {
    expect(clipboardWxml).toContain('perlerSizes')
    expect(clipboardWxml).toContain('perlerStyles')
    expect(clipboardWxml).toContain('perlerLimits')
    expect(clipboardWxml).toContain('perlerPreviewImage')
    expect(clipboardWxml).toContain('onPerlerPreview')
    expect(clipboardWxml).toContain('色号图纸')
  })
  it('renders explicit rows and prevents cell wrapping on fractional device widths', () => {
    expect(clipboardSource).toContain('buildPerlerRows')
    expect(clipboardWxml).toContain('wx:for="{{perlerRows}}"')
    expect(clipboardWxml).toContain('wx:for="{{row.cells}}"')
    const rowStyle = clipboardStyle.match(/\.perler-row\s*\{([^}]+)\}/)?.[1]
    expect(rowStyle).toContain('flex-wrap: nowrap')
    expect(clipboardStyle).not.toMatch(/width:\s*640rpx/)
    expect(clipboardStyle).not.toMatch(/width:\s*20rpx/)
  })
  it('passes a real segmented preview into the object preview component', () => {
    expect(clipboardWxml).toMatch(/<object-preview[\s\S]*preview-image="{{previewImage}}"/)
  })

  it('renders the transparent PNG or an honest empty state without fake content', () => {
    expect(previewWxml).toMatch(/<image\s+wx:if="{{previewImage}}"/)
    expect(previewWxml).toContain('尚未取得真实抠图')
    expect(previewWxml).not.toContain('cat-')
  })

  it('uses the real perler plugin with visible loading and error states', () => {
    expect(clipboardSource).toContain('RemotePerlerGenerator')
    expect(clipboardSource).not.toContain('generateMockPerler')
    expect(clipboardWxml).toContain("perlerStatus === 'loading'")
    expect(clipboardWxml).toContain('perlerError')
  })
})
