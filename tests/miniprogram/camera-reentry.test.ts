import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), dispose: vi.fn() }));
vi.mock('../../miniprogram/vision/visionkit-hand-session', () => ({
  VisionKitHandSession: class {
    start = lifecycle.start;
    stop = lifecycle.stop;
  },
}));
vi.mock('../../miniprogram/vision/visionkit-camera-renderer', () => ({
  createVisionKitCameraRenderer: () => ({ render: vi.fn(), dispose: lifecycle.dispose }),
}));

let page: any;
let queries: Array<(result: Array<{ node?: object }>) => void>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  queries = [];
  vi.stubGlobal('Page', (definition: any) => {
    page = { ...definition, data: { ...definition.data }, setData(update: object, callback?: () => void) { Object.assign(this.data, update); callback?.(); } };
  });
  vi.stubGlobal('wx', {
    getWindowInfo: () => ({ windowWidth: 400, windowHeight: 800, pixelRatio: 3 }),
    nextTick: (callback: () => void) => callback(),
    createSelectorQuery: () => ({ select: () => ({ node: () => ({ exec: (callback: (result: Array<{ node?: object }>) => void) => queries.push(callback) }) }) }),
    createCameraContext: () => ({ onCameraFrame: () => ({ start() {}, stop() {} }) }),
  });
  await import('../../miniprogram/pages/camera/camera');
  page.data.useVisionKit = true;
  page.onShow();
});

afterEach(() => { page.onUnload(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Camera page reentry after copying to Clipboard', () => {
  it('can reopen five times without stale errors disabling the new camera', async () => {
    for (let entry = 0; entry < 5; entry++) {
      await vi.advanceTimersByTimeAsync(1);
      queries[queries.length - 1]([{ node: {} }]);
      expect(lifecycle.start).toHaveBeenCalledTimes(entry + 1);
      const oldHandlers = lifecycle.start.mock.calls[entry][2];
      page.data.handDetected = true;
      page.onHide();
      page.onShow();
      oldHandlers.onError(new Error('old session closed'));
      expect(page.data.useVisionKit).toBe(true);
      expect(page.data.visionCanvasMounted).toBe(true);
      expect(page.data.handDetected).toBe(false);
    }
  });
  it('clears stale hand visibility and retries real tracking after a previous native fallback', () => {
    page.data.handDetected = true;
    page.fallbackToCamera(new Error('temporary camera busy'));
    page.onHide();
    page.onShow();
    expect(page.data.useVisionKit).toBe(true);
    expect(page.data.handDetected).toBe(false);
  });
  it('does not start a native camera from the previous visible lifetime selector callback', async () => {
    await vi.advanceTimersByTimeAsync(1);
    const oldQuery = queries[0];
    page.onHide();
    page.onShow();
    await vi.advanceTimersByTimeAsync(1);
    expect(queries.length).toBe(2);
    oldQuery([{ node: {} }]);
    expect(lifecycle.start).not.toHaveBeenCalled();
    queries[1]([{ node: {} }]);
    expect(lifecycle.start).toHaveBeenCalledOnce();
  });

  it('ignores a detached old canvas query instead of switching the new page into touch-only Camera', async () => {
    await vi.advanceTimersByTimeAsync(1);
    const oldQuery = queries[0];
    page.onHide();
    page.onShow();
    await vi.advanceTimersByTimeAsync(1);
    oldQuery([]);
    expect(page.data.useVisionKit).toBe(true);
    queries[1]([{ node: {} }]);
    expect(lifecycle.start).toHaveBeenCalledOnce();
  });
});
