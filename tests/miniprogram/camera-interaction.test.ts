import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  capture: vi.fn(async () => 'tmp://grab.jpg'),
  segment: vi.fn(async () => ({ id: 'real', type: 'object', createdAt: 1 })),
}))
vi.mock('../../miniprogram/vision/frame-capture', () => ({
  VisionKitCanvasCapture: class { capture = mocks.capture },
  CameraPhotoCapture: class { capture = mocks.capture },
}))
vi.mock('../../miniprogram/vision/remote-segmentation-adapter', () => ({
  RemoteSegmentationAdapter: class { segment = mocks.segment },
}))
vi.mock('../../miniprogram/vision/visionkit-hand-session', () => ({
  VisionKitHandSession: class { stop() {} start(_canvas: unknown, _renderer: unknown, callbacks: any) { callbacks.onReady() } },
}))
vi.mock('../../miniprogram/vision/visionkit-camera-renderer', () => ({ createVisionKitCameraRenderer: () => ({}) }))

let page: any
let clipboardStore: any
let navigate: ReturnType<typeof vi.fn>
let drawColorPatch: ReturnType<typeof vi.fn>
const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] })
const anchor = (closed: boolean) => ({
  points: Array.from({ length: 21 }, (_, index) => ({ x: index === 4 ? closed ? 0.48 : 0.2 : index === 8 ? 0.52 : index === 5 ? 0.3 : index === 17 ? 0.7 : 0.5, y: 0.5 })),
  origin: { x: 0.2, y: 0.2 }, size: { width: 0.6, height: 0.6 },
})

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  mocks.capture.mockClear(); mocks.segment.mockClear()
  navigate = vi.fn()
  drawColorPatch = vi.fn()
  vi.stubGlobal('Page', (definition: any) => {
    page = { ...definition, data: { ...definition.data }, setData(update: object) { Object.assign(this.data, update) } }
  })
  vi.stubGlobal('wx', {
    getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800, pixelRatio: 3 }),
    nextTick: (callback: () => void) => callback(),
    createSelectorQuery: () => ({ select: () => ({ node: () => ({ exec: (cb: any) => cb([{ node: {} }]) }) }) }),
    createCameraContext: () => ({ onCameraFrame: () => ({ start() {}, stop() {} }) }),
    getImageInfo: (options: any) => options.success({ width: 640, height: 480, orientation: 'up' }),
    createOffscreenCanvas: () => ({ width: 9, height: 9, getContext: () => ({ drawImage: drawColorPatch, getImageData: () => ({ data: new Uint8ClampedArray(Array.from({ length: 81 }, () => [215, 106, 66, 255]).flat()) }) }), createImage: () => ({ width: 640, height: 480, onload: undefined, set src(_value) { this.onload() } }) }),
    navigateTo: navigate,
    showToast: vi.fn(),
  })
  clipboardStore = (await import('../../miniprogram/clipboard/clipboard-store')).clipboardStore
  await import('../../miniprogram/pages/camera/camera')
  page.data.useVisionKit = false
  page.onShow()
  page.onCameraReady()
})
afterEach(() => { page.onUnload(); clipboardStore.clear(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('camera Grab snapshot lifecycle', () => {
  it('grabs with 150ms hand callbacks and changing native ids after showing the index cursor', async () => {
    page.data.useVisionKit = true;
    page.onVisionHand({ ...anchor(false), id: 1 });
    expect(page.data.handDetected).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    page.onVisionHand({ ...anchor(true), id: 2 });
    expect(page.data.status).toContain('检测到捏合');
    await vi.advanceTimersByTimeAsync(150);
    page.onVisionHand({ ...anchor(true), id: 3 });
    expect(page.data.isGrabbed).toBe(true);
    expect(page.data.finalCapturing).toBe(true);
  });
  it('shows and moves the cursor with native score placeholders, then starts a real hand grab', async () => {
    page.data.useVisionKit = true;
    const native = (closed: boolean) => ({ ...anchor(closed), score: 0, confidence: [] });
    page.onVisionHand(native(false));
    expect(page.data.handDetected).toBe(true);
    expect(page.data.cursorX).toBeCloseTo(.52);
    await vi.advanceTimersByTimeAsync(50);
    const moved = native(false); moved.points[8].x = .62;
    page.onVisionHand(moved);
    expect(page.data.cursorX).toBeGreaterThan(.52);
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(native(true));
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(native(true));
    expect(page.data.isGrabbed).toBe(true);
  });
  it('surfaces local color read failure and resets Grab without calling the backend', async () => {
    Object.assign(wx, { createOffscreenCanvas: () => ({ width: 9, height: 9, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(81 * 4) }) }), createImage: () => ({ width: 640, height: 480, onload: undefined, set src(_value) { this.onload() } }) }) })
    page.onModeChange({ detail: { mode: 'color' } })
    await page.onTouchStart(touch(200, 400)); await vi.advanceTimersByTimeAsync(180)
    const finish = page.onTouchEnd()
    await vi.advanceTimersByTimeAsync(700); await finish
    expect(page.data.status).toContain('颜色抓取失败')
    expect(page.data.isCopying).toBe(false)
    expect(mocks.segment).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
  it('captures color on device at the original photo point, without segmentation or sampling the drag endpoint', async () => {
    page.onModeChange({ detail: { mode: 'color' } })
    await page.onTouchStart(touch(80, 320))
    await vi.advanceTimersByTimeAsync(180)
    page.onTouchMove(touch(360, 640))
    const finish = page.onTouchEnd()
    await vi.advanceTimersByTimeAsync(700); await finish
    expect(clipboardStore.get()).toMatchObject({ type: 'color', sourceFrame: 'tmp://grab.jpg', color: { hex: '#D76A42', rgb: [215, 106, 66] } })
    expect(mocks.segment).not.toHaveBeenCalled()
    expect(drawColorPatch).toHaveBeenCalledWith(expect.anything(), 244, 188, 9, 9, 0, 0, 9, 9)
    expect(navigate).toHaveBeenCalledTimes(1)
  })
  it('ignores late native init callbacks after a cancelled camera handoff', async () => {
    page.data.useVisionKit = true
    page.onVisionHand(anchor(true))
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(anchor(true))
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(anchor(true))
    expect(page.data.finalCapturing).toBe(true)
    page.onHide()
    expect(page.data.useVisionKit).toBe(true)
    expect(page.data.finalCapturing).toBe(false)
    page.onShow()
    await vi.advanceTimersByTimeAsync(1)
    page.onCameraReady() // Detached native Camera may finish initialization late.
    expect(page.data.handStatus).not.toContain('触摸调试')
    expect(mocks.segment).not.toHaveBeenCalled()
  })
  it('keeps a brief hand loss but cancels missing tracking without copying', async () => {
    page.data.useVisionKit = true
    page.onVisionHand(anchor(true))
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(anchor(true))
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand(anchor(true))
    expect(page.data.isGrabbed).toBe(true)
    // A deliberate VK → native Camera pause must not count as tracking loss.
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand()
    expect(page.data.isGrabbed).toBe(true)
    page.onCameraReady()
    await vi.advanceTimersByTimeAsync(180)
    // Native hand inference can need a warm-up after camera ownership returns.
    await vi.advanceTimersByTimeAsync(500)
    page.onVisionHand()
    expect(page.data.isGrabbed).toBe(true)
    page.onVisionHand(anchor(true))
    await vi.advanceTimersByTimeAsync(40); page.onVisionHand()
    expect(page.data.isGrabbed).toBe(true)
    await vi.advanceTimersByTimeAsync(280) // Grab now has 300ms tracking grace.
    expect(page.data.isGrabbed).toBe(false)
    expect(mocks.segment).not.toHaveBeenCalled()
    page.onVisionHand(anchor(true))
    expect(page.data.handStatus).toContain('先张开')
    expect(page.data.isGrabbed).toBe(false)
  })
  it('exports on Grab and sends the original mapped point, not drag end, once', async () => {
    await page.onTouchStart(touch(80, 320))
    await vi.advanceTimersByTimeAsync(180)
    expect(mocks.capture).toHaveBeenCalledTimes(1)
    page.onTouchMove(touch(360, 640))
    const finish = page.onTouchEnd()
    page.onTouchEnd()
    await vi.advanceTimersByTimeAsync(700)
    await finish
    expect(mocks.capture).toHaveBeenCalledTimes(1)
    expect(mocks.segment).toHaveBeenCalledTimes(1)
    expect(mocks.segment).toHaveBeenCalledWith(expect.objectContaining({ image: 'tmp://grab.jpg', point: { x: 0.3875, y: 0.4 }, mode: 'object',
      prompt: { positivePoints: [{ x: .3875, y: .4 }], negativePoints: [], box: undefined } }))
    expect(navigate).toHaveBeenCalledTimes(1)
  })
  it('does not copy when a touch is cancelled', async () => {
    await page.onTouchStart(touch(200, 400))
    page.onTouchCancel()
    await page.onTouchEnd()
    expect(mocks.segment).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(page.data.isGrabbed).toBe(false)
  })
  it('does not navigate with an old result after the page has been hidden', async () => {
    await page.onTouchStart(touch(200, 400))
    const finish = page.onTouchEnd()
    page.onHide()
    await vi.advanceTimersByTimeAsync(700)
    await finish
    expect(navigate).not.toHaveBeenCalled()
  })
  it('does not start a late asynchronous touch after cancellation', async () => {
    const start = page.onTouchStart(touch(200, 400))
    page.onTouchCancel()
    await start
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(page.data.isGrabbed).toBe(false)
  })
})
