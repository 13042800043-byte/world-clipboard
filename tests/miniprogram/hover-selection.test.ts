import { describe, it, expect, vi } from 'vitest'
import { HoverSelectionController } from '../../miniprogram/vision/hover-selection-controller'

const result = { success: true as const, mode: 'object' as const, preview: 'data:image/png;base64,a', mask: 'data:image/png;base64,b', outline: 'data:image/png;base64,c', bbox: { x: .3, y: .3, width: .4, height: .4 } }
describe('stable hover selection', () => {
  it('throttles requests, locks a recent box, and expires stale candidates', async () => {
    const select = vi.fn(async () => result)
    const controller = new HoverSelectionController(select)
    await controller.observe({ x: .5, y: .5 }, 100)
    await controller.observe({ x: .5, y: .5 }, 400)
    await controller.observe({ x: .5, y: .5 }, 500)
    expect(select).toHaveBeenCalledOnce()
    expect(controller.lock({ x: .5, y: .5 }, 600)?.bbox).toEqual(result.bbox)
    expect(controller.lock({ x: .5, y: .5 }, 2100)).toBeUndefined()
  })
  it('ignores an old response after cursor movement or reset', async () => {
    let resolve!: (value: typeof result) => void
    const controller = new HoverSelectionController(() => new Promise(r => { resolve = r }))
    await controller.observe({ x: .5, y: .5 }, 100)
    const pending = controller.observe({ x: .5, y: .5 }, 400)
    await controller.observe({ x: .8, y: .5 }, 450)
    resolve(result)
    await pending
    expect(controller.lock({ x: .5, y: .5 }, 500)).toBeUndefined()
  })
})
