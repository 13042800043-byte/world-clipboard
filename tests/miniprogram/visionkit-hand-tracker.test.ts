import { describe, expect, it } from 'vitest';
import {
  VisionKitHandGestureAdapter,
  mapVisionKitAnchor,
  type VisionKitHandAnchor,
} from '../../miniprogram/vision/visionkit-hand-tracker';

function createAnchor(thumbX: number, indexX: number): VisionKitHandAnchor {
  const points = Array.from({ length: 21 }, (_, index) => ({
    x: index === 4 ? thumbX : index === 8 ? indexX : index === 5 ? 0.3 : index === 17 ? 0.7 : 0.5,
    y: 0.5,
    z: 0,
  }));

  return {
    points,
    origin: { x: 0.25, y: 0.2 },
    size: { width: 0.5, height: 0.6 },
  };
}

describe('VisionKit hand anchor adapter', () => {
  it('maps thumb and index tips to a centered spatial cursor', () => {
    const result = mapVisionKitAnchor(createAnchor(0.4, 0.6));

    expect(result.detected).toBe(true);
    expect(result.landmarks).toHaveLength(21);
    expect(result.cursor).toEqual({ x: 0.5, y: 0.5 });
    expect(result.pinchDistance).toBeCloseTo(0.5);
  });

  it('can mirror front-camera coordinates without changing distance', () => {
    const result = mapVisionKitAnchor(createAnchor(0.2, 0.4), true);

    expect(result.cursor.x).toBeCloseTo(0.7);
    expect(result.pinchDistance).toBeCloseTo(0.5);
  });

  it('rejects anchors that do not contain 21 landmarks', () => {
    const result = mapVisionKitAnchor({
      points: [{ x: 0.5, y: 0.5 }],
      origin: { x: 0.4, y: 0.4 },
      size: { width: 0.2, height: 0.2 },
    });

    expect(result.detected).toBe(false);
  });

  it('emits stable pinch start, hold and end phases', () => {
    const adapter = new VisionKitHandGestureAdapter();

    expect(adapter.update(createAnchor(0.48, 0.52)).pinch).toBeUndefined();
    expect(adapter.update(createAnchor(0.48, 0.52)).pinch).toBe('PINCH_START');
    expect(adapter.update(createAnchor(0.44, 0.56)).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(createAnchor(0.2, 0.5)).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(createAnchor(0.2, 0.5)).pinch).toBe('PINCH_END');
  });

  it('normalizes pinch distance by palm width instead of the changing hand box', () => {
    const compactBox = createAnchor(0.42, 0.5);
    compactBox.size = { width: 0.2, height: 0.2 };
    const extendedBox = createAnchor(0.42, 0.5);
    extendedBox.size = { width: 0.8, height: 0.9 };

    expect(mapVisionKitAnchor(compactBox).pinchDistance).toBeCloseTo(0.2);
    expect(mapVisionKitAnchor(extendedBox).pinchDistance).toBeCloseTo(0.2);
  });

  it('smooths cursor jumps between consecutive hand anchors', () => {
    const adapter = new VisionKitHandGestureAdapter();
    const first = adapter.update(createAnchor(0.38, 0.42));
    const second = adapter.update(createAnchor(0.58, 0.62));

    expect(first.hand.cursor.x).toBeCloseTo(0.4);
    expect(second.hand.cursor.x).toBeGreaterThan(0.4);
    expect(second.hand.cursor.x).toBeLessThan(0.6);
  });
});
