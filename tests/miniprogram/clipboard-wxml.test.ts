import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clipboardWxml = readFileSync('miniprogram/pages/clipboard/clipboard.wxml', 'utf8')
const previewWxml = readFileSync('miniprogram/components/object-preview/object-preview.wxml', 'utf8')

describe('clipboard captured image rendering', () => {
  it('passes a real segmented preview into the object preview component', () => {
    expect(clipboardWxml).toMatch(/<object-preview[\s\S]*preview-image="{{previewImage}}"/)
  })

  it('renders the transparent PNG or an honest empty state without fake content', () => {
    expect(previewWxml).toMatch(/<image\s+wx:if="{{previewImage}}"/)
    expect(previewWxml).toContain('尚未取得真实抠图')
    expect(previewWxml).not.toContain('cat-')
  })
})
