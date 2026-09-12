import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const clipboardWxml = readFileSync('miniprogram/pages/clipboard/clipboard.wxml', 'utf8')
const previewWxml = readFileSync('miniprogram/components/object-preview/object-preview.wxml', 'utf8')

describe('clipboard captured image rendering', () => {
  it('passes a real segmented preview into the object preview component', () => {
    expect(clipboardWxml).toMatch(/<object-preview[\s\S]*preview-image="{{previewImage}}"/)
  })

  it('renders the transparent PNG when it is present and keeps the mock illustration fallback', () => {
    expect(previewWxml).toMatch(/<image\s+wx:if="{{previewImage}}"/)
    expect(previewWxml).toMatch(/<block\s+wx:else/)
  })
})
