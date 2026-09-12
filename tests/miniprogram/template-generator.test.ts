import { describe, expect, it, vi } from 'vitest'
import { RemoteTemplateGenerator, parseTemplateResult, isPngDataUrl } from '../../miniprogram/plugins/template-generator'

const image = 'data:image/png;base64,YQ=='
const result = { kind: 'lego', title: 'LEGO 平面拼搭', previewImage: image, chartImage: image, exportImage: image,
  previewLabel: '拼搭', chartLabel: '坐标', exportLabel: 'PNG', paletteLabel: '近似色',
  metrics: [{ label: '砖块', value: '1' }], materials: [{ id: 'L01-1x1', name: '红', hex: '#D30022', count: 1, unit: '块' }], notes: ['非 3D'] }

describe('template plugins transport', () => {
  it('accepts bounded detailed sticker sheets but rejects oversized assets', () => {
    expect(isPngDataUrl('data:image/png;base64,' + 'A'.repeat(4_100_000))).toBe(true)
    expect(isPngDataUrl('data:image/png;base64,' + 'A'.repeat(9_000_000))).toBe(false)
  })
  it('requests a real cutout and parses the expected plugin only', async () => {
    const request = vi.fn((options: any) => options.success({ statusCode: 200, data: result }))
    const generator = new RemoteTemplateGenerator('http://192.168.0.2:8000/', request)
    expect(await generator.generate('lego', { id: 'a', type: 'object', createdAt: 1, previewImage: image }, { size: 32, maxColors: 16, border: 8 })).toEqual(result)
    expect(request.mock.calls[0][0].url).toBe('http://192.168.0.2:8000/api/templates/lego')
    expect(request.mock.calls[0][0].data.image).toBe(image)
  })
  it.each([{ ...result, kind: 'pixel' }, { ...result, exportImage: 'https://evil.invalid/x.png' },
    { ...result, materials: [{ ...result.materials[0], count: -1 }] }, { ...result, metrics: [{ label: 'n', value: 4 }] }])('rejects malformed or wrong-plugin responses', value => {
    expect(() => parseTemplateResult(value, 'lego')).toThrow()
  })
  it('does not upload when no real cutout exists', async () => {
    const request = vi.fn()
    await expect(new RemoteTemplateGenerator('http://192.168.0.2:8000', request).generate('sticker', { id: 'a', type: 'object', createdAt: 1 }, { size: 32, maxColors: 16, border: 8 })).rejects.toThrow('真实')
    expect(request).not.toHaveBeenCalled()
  })
})
