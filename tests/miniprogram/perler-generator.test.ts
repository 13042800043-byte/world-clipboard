import { describe, expect, it, vi } from 'vitest'
import type { ClipboardItem } from '../../miniprogram/clipboard/clipboard-types'
import { RemotePerlerGenerator } from '../../miniprogram/plugins/perler/perler-generator'

const capturedItem: ClipboardItem = {
  id: 'real-object',
  type: 'object',
  createdAt: 1,
  previewImage: 'data:image/png;base64,real-cutout',
}

function validResult(size = 8) {
  return {
    size,
    cells: Array.from({ length: size * size }, (_, index) => ({
      key: `${index % size}-${Math.floor(index / size)}`,
      color: index < 12 ? '#D9363E' : '#EEF0F2',
      empty: index >= 12,
    })),
    colors: [{ id: 'R01', name: '正红', hex: '#D9363E', count: 12 }],
    totalBeads: 12,
  }
}

describe('RemotePerlerGenerator', () => {
  it('generates the grid from the captured transparent PNG', async () => {
    const request = vi.fn((options) => options.success({ statusCode: 200, data: validResult(8) }))
    const generator = new RemotePerlerGenerator('http://127.0.0.1:8000', request)

    const result = await generator.generate(capturedItem, 8)

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:8000/api/perler',
      method: 'POST',
      data: { image: capturedItem.previewImage, size: 8 },
      timeout: 8000,
    }))
    expect(result.cells).toHaveLength(64)
    expect(result.totalBeads).toBe(12)
  })

  it('refuses to invent a grid when there is no real cutout', async () => {
    const request = vi.fn()
    const generator = new RemotePerlerGenerator('http://127.0.0.1:8000', request)

    await expect(generator.generate({ ...capturedItem, previewImage: undefined }, 32))
      .rejects.toThrow('请先完成真实物体抠图')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects malformed grids returned by the backend', async () => {
    const generator = new RemotePerlerGenerator('http://127.0.0.1:8000', (options) => {
      options.success({ statusCode: 200, data: { size: 32, cells: [] } })
    })

    await expect(generator.generate(capturedItem, 32)).rejects.toThrow('invalid perler response')
  })
})
