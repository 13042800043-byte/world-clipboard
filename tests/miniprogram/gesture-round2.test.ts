import { describe, expect, it } from 'vitest';
import { createPinchTracker, updatePinchTracker } from '../../miniprogram/vision/gesture-engine';
import { GESTURE_PROFILES } from '../../miniprogram/vision/gesture-config';
import { VisionKitHandGestureAdapter, type VisionKitHandAnchor } from '../../miniprogram/vision/visionkit-hand-tracker';
import { SpatialController } from '../../miniprogram/interaction/spatial-controller';

export function handAt(distance: number, x = .5, palm = .4): VisionKitHandAnchor {
  return { points: Array.from({ length: 21 }, (_, i) => ({
    x: i === 4 ? x - distance * .4 : i === 5 ? x - palm / 2 : i === 17 ? x + palm / 2 : x,
    y: .5,
  })), origin: { x: .1, y: .1 }, size: { width: .8, height: .8 } };
}

describe('round 2 predictable gesture timing', () => {
  it('does not confirm two callbacks arriving just 1ms apart', () => {
    const adapter = new VisionKitHandGestureAdapter();
    adapter.update(handAt(.2), false, 0);
    expect(adapter.update(handAt(.2), false, 1).pinch).toBeUndefined();
    expect(adapter.update(handAt(.2), false, 31).pinch).toBe('PINCH_START');
  });

  it.each([15, 24, 30, 60])('confirms and releases once at %i FPS with bounded time', fps => {
    let tracker = createPinchTracker();
    const events: Array<{ event: string; at: number }> = [];
    for (let i = 0; i <= fps * 3; i++) {
      const at = i * 1000 / fps;
      const result = updatePinchTracker(tracker, at < 2000 ? .2 : .7, GESTURE_PROFILES.stable, at);
      tracker = result.tracker;
      if (result.event && result.event !== 'PINCH_HOLD') events.push({ event: result.event, at });
    }
    expect(events.map(e => e.event)).toEqual(['PINCH_START', 'PINCH_END']);
    expect(events[0].at).toBeGreaterThanOrEqual(30);
    expect(events[0].at).toBeLessThanOrEqual(30 + 1000 / fps);
    expect(events[1].at - 2000).toBeLessThanOrEqual(30 + 2 * 1000 / fps);
  });

  it('keeps one session across hold and gives the next pinch a new id after cooldown', () => {
    const adapter = new VisionKitHandGestureAdapter();
    adapter.update(handAt(.2), false, 0);
    const first = adapter.update(handAt(.2), false, 40);
    expect(first.gestureSessionId).toBe(1);
    expect(adapter.update(handAt(.2), false, 80).gestureSessionId).toBe(1);
    adapter.update(handAt(.8), false, 120);
    expect(adapter.update(handAt(.8), false, 160).pinch).toBe('PINCH_END');
    expect(adapter.update(handAt(.2), false, 190).pinch).toBeUndefined();
    expect(adapter.update(handAt(.2), false, 220).pinch).toBeUndefined();
    adapter.update(handAt(.2), false, 260);
    expect(adapter.update(handAt(.2), false, 300).gestureSessionId).toBe(2);
  });

  it('gates weak observations, retains grab briefly, and never releases on tracking loss', () => {
    const adapter = new VisionKitHandGestureAdapter();
    const weak = { ...handAt(.2), score: .1 };
    for (const at of [0, 40, 80]) expect(adapter.update(weak, false, at).pinch).toBeUndefined();
    adapter.update(handAt(.2), false, 120);
    adapter.update(handAt(.2), false, 160);
    expect(adapter.update(weak, false, 260).tracking).toBe('grace');
    expect(adapter.update(handAt(.2), false, 300).pinch).toBe('PINCH_HOLD');
    expect(adapter.update(undefined, false, 550).tracking).toBe('grace');
    const lost = adapter.update(undefined, false, 601);
    expect(lost.tracking).toBe('lost');
    expect(lost.pinch).toBeUndefined();
    expect(adapter.update(handAt(.2), false, 650).phase).toBe('REARMING');
  });

  it('smooths palm scale and rejects edge starts without treating absent confidence as zero', () => {
    const adapter = new VisionKitHandGestureAdapter();
    adapter.update(handAt(.8), false, 0);
    const changed = adapter.update(handAt(.8, .5, .2), false, 40);
    expect(changed.filteredPalmScale).toBeGreaterThan(.2);
    expect(changed.filteredPalmScale).toBeLessThan(.4);
    for (const at of [80, 120]) expect(adapter.update(handAt(.01, .99), false, at).pinch).toBeUndefined();
  });

  it('keeps the cursor source continuous and freezes the grab until deliberate drag', () => {
    const adapter = new VisionKitHandGestureAdapter({ ...GESTURE_PROFILES.stable, useOneEuroFilter: false });
    adapter.update(handAt(.8), false, 0);
    adapter.update(handAt(.8), false, 40);
    adapter.update(handAt(.2), false, 80);
    const grab = adapter.update(handAt(.2), false, 120);
    const hold = adapter.update(handAt(.2), false, 160);
    expect(hold.hand.cursor).toEqual(grab.hand.cursor);
    expect(hold.rawCursor).toMatchObject({ x: .5, y: .5 });
    const controller = new SpatialController();
    controller.start(grab.hand.cursor, grab.selectionPoint);
    expect(controller.move({ x: .501, y: .5 }).gesture).toBe('GRABBED');
    expect(controller.move({ x: .6, y: .5 }).gesture).toBe('DRAGGING');
    expect(controller.getSelectionPoint()).toEqual(grab.selectionPoint);
  });
});
