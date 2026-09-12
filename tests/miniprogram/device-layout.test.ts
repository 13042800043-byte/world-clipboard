import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDeviceLayout } from '../../miniprogram/utils/device-layout'

afterEach(() => vi.unstubAllGlobals())

describe('custom navigation on real devices', () => {
  it('reserves the status bar and actual WeChat capsule without changing the camera viewport', () => {
    vi.stubGlobal('wx', {
      getWindowInfo: () => ({ windowWidth: 393, windowHeight: 852, statusBarHeight: 54, screenHeight: 852, safeArea: { bottom: 818 } }),
      getMenuButtonBoundingClientRect: () => ({ left: 296, right: 383, top: 62, bottom: 94, width: 87, height: 32 }),
    })
    expect(getDeviceLayout()).toEqual({ navTop: 54, navHeight: 102, navRightInset: 109, bottomInset: 34 })
  })

  it('uses a safe fallback when capsule metrics are absent or zero in the simulator', () => {
    vi.stubGlobal('wx', {
      getWindowInfo: () => ({ windowWidth: 320, windowHeight: 640, statusBarHeight: 24 }),
      getMenuButtonBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    })
    expect(getDeviceLayout()).toEqual({ navTop: 24, navHeight: 68, navRightInset: 106, bottomInset: 0 })
  })

  it('still renders in test/debug environments without a capsule API', () => {
    vi.stubGlobal('wx', { getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800 }) })
    expect(getDeviceLayout().navTop).toBe(24)
    expect(getDeviceLayout().navHeight).toBe(68)
  })
})

describe('mini program layout regression contracts', () => {
  it('uses a block content wrapper for native button plugin labels and status', () => {
    const wxml = readFileSync('miniprogram/components/template-card/template-card.wxml', 'utf8')
    const style = readFileSync('miniprogram/components/template-card/template-card.wxss', 'utf8')
    expect(wxml).toContain('<view class="card__content">')
    expect(style.match(/\.card__content\s*\{([^}]+)\}/)?.[1]).toContain('flex-direction: column')
    expect(style.match(/\.card__label\s*\{([^}]+)\}/)?.[1]).toContain('display: block')
    expect(style.match(/\.card__state\s*\{([^}]+)\}/)?.[1]).toContain('display: block')
  })
  it('opts custom buttons out of native default-sized button rules', () => {
    for (const file of [
      'components/template-card/template-card.wxml',
      'components/capture-mode-selector/capture-mode-selector.wxml',
      'pages/clipboard/clipboard.wxml',
      'pages/camera/camera.wxml',
    ]) {
      const source = readFileSync(`miniprogram/${file}`, 'utf8')
      const buttons = source.match(/<button\b[^>]*>/g) || []
      expect(buttons.length).toBeGreaterThan(0)
      for (const button of buttons) expect(button).toContain('size="mini"')
    }
  })

  it('keeps template padding and borders inside each column', () => {
    const style = readFileSync('miniprogram/components/template-card/template-card.wxss', 'utf8')
    const card = style.match(/\.card\s*\{([^}]+)\}/)?.[1]
    expect(card).toContain('box-sizing: border-box')
    expect(card).toContain('min-width: 0')
    expect(card).toContain('width: 100%')
  })

  it('uses measured navigation in both pages, not CSS env alone', () => {
    for (const name of ['camera', 'clipboard']) {
      const wxml = readFileSync(`miniprogram/pages/${name}/${name}.wxml`, 'utf8')
      expect(wxml).toContain('navTop')
      expect(wxml).toContain('navRightInset')
    }
  })
})
