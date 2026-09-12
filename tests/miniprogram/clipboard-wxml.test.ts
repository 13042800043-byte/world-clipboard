import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clipboardWxml = readFileSync('miniprogram/pages/clipboard/clipboard.wxml', 'utf8')
const previewWxml = readFileSync('miniprogram/components/object-preview/object-preview.wxml', 'utf8')
const clipboardSource = readFileSync('miniprogram/pages/clipboard/clipboard.ts', 'utf8')
const clipboardStyle = readFileSync('miniprogram/pages/clipboard/clipboard.wxss', 'utf8')

describe('clipboard captured image rendering', () => {
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
