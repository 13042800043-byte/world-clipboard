import { describe, expect, it, vi } from 'vitest';
import { VisionKitHandSession, type VisionKitSessionLike } from '../../miniprogram/vision/visionkit-hand-session';

function createNativeSession() {
  let nextId = 0;
  const pending = new Map<number, (timestamp: number) => void>();
  const native = {
    start: (ready: (error?: unknown) => void) => ready(),
    stop: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn(),
    requestAnimationFrame: (callback: (timestamp: number) => void) => {
      pending.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: vi.fn((id: number) => { pending.delete(id); }),
    getVKFrame: vi.fn(() => ({ id: 'live-camera-frame' })),
  } satisfies VisionKitSessionLike & { destroy(): void; cancelAnimationFrame(id: number): void };
  return { native, pending };
}

function createHandlers() {
  return { onHand: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
}

describe('VisionKit camera resources across repeated captures', () => {
  it('releases camera ownership and pending frame work on stop', () => {
    const { native, pending } = createNativeSession();
    const renderer = { render: vi.fn(), dispose: vi.fn() };
    const session = new VisionKitHandSession(() => native);
    session.start({ width: 400, height: 800 }, renderer, createHandlers());
    session.stop();
    session.stop();
    expect(pending.size).toBe(0);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('an already-dispatched old frame cannot read or render the replacement session', () => {
    const old = createNativeSession();
    const fresh = createNativeSession();
    const factory = vi.fn().mockReturnValueOnce(old.native).mockReturnValueOnce(fresh.native);
    const session = new VisionKitHandSession(factory);
    const oldRenderer = { render: vi.fn(), dispose: vi.fn() };
    const freshRenderer = { render: vi.fn(), dispose: vi.fn() };
    session.start({ width: 400, height: 800 }, oldRenderer, createHandlers());
    const oldCallback = [...old.pending.values()][0];
    session.start({ width: 400, height: 800 }, freshRenderer, createHandlers());
    oldCallback(100);
    expect(fresh.native.getVKFrame).not.toHaveBeenCalled();
    expect(freshRenderer.render).not.toHaveBeenCalled();
    expect(fresh.pending.size).toBe(1);
    [...fresh.pending.values()][0](100);
    expect(freshRenderer.render).toHaveBeenCalledOnce();
  });

  it.each(['getVKFrame', 'render'] as const)('reports %s failures and releases the broken camera rather than freezing silently', (stage) => {
    const { native, pending } = createNativeSession();
    const error = new Error(`${stage} failed after camera handoff`);
    const renderer = { render: vi.fn(), dispose: vi.fn() };
    if (stage === 'getVKFrame') native.getVKFrame.mockImplementation(() => { throw error; });
    else renderer.render.mockImplementation(() => { throw error; });
    const handlers = createHandlers();
    const session = new VisionKitHandSession(() => native);
    session.start({ width: 400, height: 800 }, renderer, handlers);
    const callback = [...pending.values()][0];
    pending.clear(); // Native RAF has dispatched this callback.
    expect(() => callback(100)).not.toThrow();
    expect(handlers.onError).toHaveBeenCalledWith(error);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(pending.size).toBe(0);
  });

  it('releases a session rejected during startup before reporting its error', () => {
    const { native } = createNativeSession();
    const error = new Error('camera busy');
    native.start = ready => ready(error);
    const renderer = { render: vi.fn(), dispose: vi.fn() };
    const handlers = createHandlers();
    new VisionKitHandSession(() => native).start({ width: 400, height: 800 }, renderer, handlers);
    expect(handlers.onError).toHaveBeenCalledWith(error);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
