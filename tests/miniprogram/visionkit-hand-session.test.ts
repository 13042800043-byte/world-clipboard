import { describe, expect, it, vi } from 'vitest';
import {
  VisionKitHandSession,
  type VisionKitSessionLike,
} from '../../miniprogram/vision/visionkit-hand-session';
import type { VisionKitHandAnchor } from '../../miniprogram/vision/visionkit-hand-tracker';

describe('VisionKit hand session', () => {
  it('selects the hand from mixed anchors and ignores removal of an unrelated anchor', () => {
    const listeners = new Map<string, (anchors: any[]) => void>();
    const onHand = vi.fn();
    const session = new VisionKitHandSession(() => ({ start: done => done(),
      on: (event, cb) => listeners.set(event, cb), requestAnimationFrame: () => 1, getVKFrame: () => undefined }));
    session.start({ width: 1, height: 1 }, { render() {}, dispose() {} }, { onHand, onReady() {}, onError() {} });
    const hand = { ...createAnchor(), type: 7, id: 10 };
    listeners.get('updateAnchors')?.([{ type: 0, id: 2 }, hand]);
    expect(onHand).toHaveBeenLastCalledWith(hand, expect.anything());
    onHand.mockClear();
    listeners.get('updateAnchors')?.([{ type: 0, id: 2 }]);
    listeners.get('removeAnchors')?.([{ type: 0, id: 2 }]);
    expect(onHand).not.toHaveBeenCalled();
    listeners.get('removeAnchors')?.([{ id: 10 }]);
    expect(onHand).toHaveBeenCalledWith(undefined, expect.anything());
    session.stop();
  });
  it('preserves target camera cadence and forwards native timestamps without inventing anchor timestamps', () => {
    let next: (at: number) => void = () => {};
    let timestamp = 0;
    const native: VisionKitSessionLike = { start: callback => callback(), stop() {}, on() {},
      requestAnimationFrame: callback => { next = callback; return 1; },
      getVKFrame: () => ({ timestamp: ++timestamp * 1_000_000 }) };
    const render = vi.fn(), onFrame = vi.fn();
    const session = new VisionKitHandSession(() => native, 24);
    session.start({ width: 1, height: 1 }, { render, dispose() {} }, { onHand() {}, onReady() {}, onError() {}, onFrame });
    for (let i = 1; i <= 600; i++) next(i * 1000 / 60);
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(239);
    expect(render.mock.calls.length).toBeLessThanOrEqual(240);
    expect(onFrame).toHaveBeenLastCalledWith(expect.any(Number), timestamp * 1_000_000);
    session.stop();
  });
  it('does not forward old native callbacks into a restarted photo session', () => {
    const generations: Array<Map<string, (value: VisionKitHandAnchor[]) => void>> = [];
    const session = new VisionKitHandSession(() => {
      const listeners = new Map<string, (value: VisionKitHandAnchor[]) => void>();
      generations.push(listeners);
      return { start: callback => callback(), stop() {}, on: (event, cb) => listeners.set(event, cb), requestAnimationFrame: () => 1, getVKFrame: () => undefined };
    });
    const onHand = vi.fn();
    const handlers = { onHand, onReady: vi.fn(), onError: vi.fn() };
    const renderer = { render: vi.fn(), dispose: vi.fn() };
    session.start({ width: 1, height: 1 }, renderer, handlers);
    session.start({ width: 1, height: 1 }, renderer, handlers);
    generations[0].get('addAnchors')?.([createAnchor()]);
    generations[0].get('removeAnchors')?.([]);
    expect(onHand).not.toHaveBeenCalled();
    generations[1].get('addAnchors')?.([createAnchor()]);
    expect(onHand).toHaveBeenCalledOnce();
  });
  it('starts official hand tracking, forwards anchors and renders camera frames', () => {
    const listeners = new Map<string, (value: VisionKitHandAnchor[]) => void>();
    let animationFrame: ((timestamp: number) => void) | undefined;
    const frame = { id: 'frame-1' };
    const fakeSession: VisionKitSessionLike = {
      start: (callback) => callback(),
      stop: vi.fn(),
      on: (event, callback) => listeners.set(event, callback),
      requestAnimationFrame: (callback) => {
        animationFrame = callback;
        return 1;
      },
      getVKFrame: () => frame,
    };
    const createSession = vi.fn(() => fakeSession);
    const render = vi.fn();
    const onHand = vi.fn();
    const onReady = vi.fn();
    const session = new VisionKitHandSession(createSession);

    session.start({ width: 750, height: 1334 }, { render, dispose: vi.fn() }, {
      onHand,
      onReady,
      onError: vi.fn(),
    });

    expect(createSession).toHaveBeenCalledWith({
      track: { plane: { mode: 1 }, hand: { mode: 1 } },
      version: 'v1',
      gl: undefined,
    });
    expect(onReady).toHaveBeenCalledOnce();

    const anchor = createAnchor();
    listeners.get('updateAnchors')?.([anchor]);
    expect(onHand).toHaveBeenCalledWith(anchor, { receivedAt: expect.any(Number) });

    animationFrame?.(100);
    expect(render).toHaveBeenCalledWith(frame);
  });

  it('stops the native session and ignores later anchor updates', () => {
    const listeners = new Map<string, (value: VisionKitHandAnchor[]) => void>();
    const stop = vi.fn();
    const dispose = vi.fn();
    const fakeSession: VisionKitSessionLike = {
      start: (callback) => callback(),
      stop,
      on: (event, callback) => listeners.set(event, callback),
      requestAnimationFrame: () => 1,
      getVKFrame: () => undefined,
    };
    const onHand = vi.fn();
    const session = new VisionKitHandSession(() => fakeSession);

    session.start({ width: 1, height: 1 }, { render: vi.fn(), dispose }, {
      onHand,
      onReady: vi.fn(),
      onError: vi.fn(),
    });
    session.stop();
    listeners.get('addAnchors')?.([createAnchor()]);

    expect(stop).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(onHand).not.toHaveBeenCalled();
  });
});

function createAnchor(): VisionKitHandAnchor {
  return {
    points: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
    origin: { x: 0.25, y: 0.25 },
    size: { width: 0.5, height: 0.5 },
  };
}
