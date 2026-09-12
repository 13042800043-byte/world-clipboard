import { describe, expect, it, vi } from 'vitest';
import {
  VisionKitHandSession,
  type VisionKitSessionLike,
} from '../../miniprogram/vision/visionkit-hand-session';
import type { VisionKitHandAnchor } from '../../miniprogram/vision/visionkit-hand-tracker';

describe('VisionKit hand session', () => {
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
    expect(onHand).toHaveBeenCalledWith(anchor);

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
