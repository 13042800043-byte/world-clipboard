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

    expect(adapter.update(createAnchor(0.48, 0.52), false, 0).pinch).toBeUndefined();
    expect(adapter.update(createAnchor(0.48, 0.52), false, 40).pinch).toBe('PINCH_START');
    expect(adapter.update(createAnchor(0.48, 0.52), false, 80).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(createAnchor(0.44, 0.56), false, 120).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(createAnchor(0.2, 0.5), false, 160).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(createAnchor(0.2, 0.5), false, 200).pinch).toBe('PINCH_END');
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
    const first = adapter.update(createAnchor(0.38, 0.42), false, 0);
    const second = adapter.update(createAnchor(0.58, 0.62), false, 40);

    expect(first.hand.cursor.x).toBeCloseTo(0.42);
    expect(second.filteredCursor!.x).toBeGreaterThan(0.42);
    expect(second.filteredCursor!.x).toBeLessThan(0.62);
  });

  it('uses the index tip for hover and locks the pre-pinch selection while dragging', () => {
    const adapter = new VisionKitHandGestureAdapter();
    const hover = adapter.update(createAnchor(0.2, 0.5), false, 0);
    expect(hover.rawCursor?.x).toBe(0.5);
    adapter.update(createAnchor(0.2, 0.5), false, 40);
    adapter.update(createAnchor(0.45, 0.49), false, 80);
    const grabbed = adapter.update(createAnchor(0.45, 0.49), false, 120);
    expect(grabbed.pinch).toBe('PINCH_START');
    expect(grabbed.selectionPoint?.x).toBeCloseTo(0.5);
    const dragged = adapter.update(createAnchor(0.65, 0.69), false, 200);
    expect(dragged.selectionPoint).toEqual(grabbed.selectionPoint);
    expect(dragged.hand.cursor.x).toBeGreaterThan(grabbed.hand.cursor.x);
  });

  it('freezes during brief loss, cancels after grace, and requires open fingers before re-grab', () => {
    const adapter = new VisionKitHandGestureAdapter();
    const closed = createAnchor(0.48, 0.52);
    adapter.update(closed, false, 0);
    adapter.update(closed, false, 40);
    adapter.update(closed, false, 80);
    const grace = adapter.update(undefined, false, 120);
    expect(grace.tracking).toBe('grace');
    expect(grace.pinch).toBeUndefined();
    expect(adapter.update(closed, false, 160).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(undefined, false, 400).tracking).toBe('grace');
    const lost = adapter.update(undefined, false, 461);
    expect(lost.tracking).toBe('lost');
    expect(lost.pinch).toBeUndefined();
    expect(adapter.update(closed, false, 500).phase).toBe('REARMING');
    for (const now of [540, 580]) adapter.update(createAnchor(0.2, 0.5), false, now);
    expect(adapter.update(closed, false, 620).pinch).toBeUndefined();
    expect(adapter.update(closed, false, 660).pinch).toBe('PINCH_START');
  });

  it('rejects invalid coordinates and corrects the distance metric for tall viewports', () => {
    const bad = createAnchor(0.4, 0.5); bad.points[8].x = NaN;
    expect(mapVisionKitAnchor(bad).detected).toBe(false);
    const vertical = createAnchor(0.5, 0.5); vertical.points[8].y = 0.6;
    expect(mapVisionKitAnchor(vertical, false, 0.5).pinchDistance).toBeCloseTo(0.5);
  });

  it('does not confirm a pinch from duplicate observations', () => {
    const adapter = new VisionKitHandGestureAdapter();
    for (let duplicate = 0; duplicate < 5; duplicate++) {
      expect(adapter.update(createAnchor(0.48, 0.52), false, 0).pinch).toBeUndefined();
    }
    expect(adapter.update(createAnchor(0.48, 0.52), false, 40).pinch).toBe('PINCH_START');
  });
});
