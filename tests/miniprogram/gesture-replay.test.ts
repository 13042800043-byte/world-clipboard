import { describe, expect, it } from 'vitest';
import { GESTURE_PROFILES, type GestureConfig } from '../../miniprogram/vision/gesture-config';
import { VisionKitHandGestureAdapter, type VisionKitHandAnchor } from '../../miniprogram/vision/visionkit-hand-tracker';

// Deterministic synthetic landmarks. These tests measure algorithm behavior,
// not camera inference, physical gesture accuracy or phone/display latency.
function anchor(x = .5, normalizedDistance = .75, palm = .24): VisionKitHandAnchor {
  const points = Array.from({ length: 21 }, () => ({ x, y: .5 }));
  points[4].x = x - normalizedDistance * palm;
  points[5].x = x - palm / 2;
  points[17].x = x + palm / 2;
  return { points, origin: { x: .1, y: .1 }, size: { width: .8, height: .8 }, score: .9 };
}
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const rms = (values: number[]) => Math.sqrt(average(values.map(value => value * value)));
const rounded = (value: number) => Number(value.toFixed(4));

function replay(config: GestureConfig) {
  const still = new VisionKitHandGestureAdapter(config);
  const rawError: number[] = [], filteredError: number[] = [], processing: number[] = [];
  let falseStarts = 0;
  for (let i = 0; i <= 90; i++) {
    const input = anchor(.5 + Math.sin(i * 2.1) * .004);
    const before = performance.now();
    const result = still.update(input, false, i * 1000 / 30);
    processing.push(performance.now() - before);
    if (i >= 15) { rawError.push(input.points[8].x - .5); filteredError.push(result.hand.cursor.x - .5); }
    if (result.pinch === 'PINCH_START') falseStarts++;
  }
  function ramp(durationMs: number) {
    const adapter = new VisionKitHandGestureAdapter(config), errors: number[] = [];
    const speed = .35 / durationMs;
    for (let i = 0; i <= 15; i++) adapter.update(anchor(.3), false, i * 1000 / 30);
    for (let i = 1; i <= Math.round(durationMs * 30 / 1000); i++) {
      const x = .3 + speed * i * 1000 / 30;
      const result = adapter.update(anchor(x), false, 500 + i * 1000 / 30);
      errors.push(Math.abs(x - result.hand.cursor.x));
    }
    return { lagMs: average(errors) / speed, finalError: errors[errors.length - 1] };
  }
  const slow = ramp(3000), fast = ramp(400);
  const gesture = new VisionKitHandGestureAdapter(config);
  const events: Array<{ type: string; at: number; session: number }> = [];
  for (let i = 0; i < 105; i++) {
    const result = gesture.update(anchor(.5, i < 60 ? .2 : .8), false, i * 1000 / 30);
    if (result.pinch && result.pinch !== 'PINCH_HOLD') events.push({ type: result.pinch, at: i * 1000 / 30, session: result.gestureSessionId });
  }
  return { rawJitterRms: rounded(rms(rawError)), filteredJitterRms: rounded(rms(filteredError)),
    slowRampEquivalentLagMs: rounded(slow.lagMs), fastRampEquivalentLagMs: rounded(fast.lagMs),
    fastFinalPositionError: rounded(fast.finalError), falseStarts,
    activationMs: rounded(events[0].at), releaseMs: rounded(events[1].at - 2000),
    startsDuring2sHold: events.filter(event => event.type === 'PINCH_START').length,
    processingAverageMs: rounded(average(processing)), processingP95Ms: rounded(p95(processing)) };
}

describe('gesture acceptance replay (synthetic, not phone results)', () => {
  it('compares baseline/stable/responsive still, slow, fast, hold and release behavior', () => {
    const report = Object.fromEntries(['current', 'stable', 'responsive'].map(name =>
      [name, replay(GESTURE_PROFILES[name as keyof typeof GESTURE_PROFILES]) ]));
    console.info('GESTURE_SYNTHETIC_REPLAY', JSON.stringify(report));
    for (const profile of Object.values(report)) {
      expect(profile.falseStarts).toBe(0);
      expect(profile.startsDuring2sHold).toBe(1);
      expect(profile.filteredJitterRms).toBeLessThan(profile.rawJitterRms * .4);
      expect(profile.activationMs).toBeLessThanOrEqual(67);
      expect(profile.releaseMs).toBeLessThanOrEqual(67);
      expect(profile.fastFinalPositionError).toBeLessThan(.06);
    }
  });

  it('rejects near-pinches and one-observation spikes; confirms 20 deliberate pinches', () => {
    let falseStarts = 0, realStarts = 0;
    for (let trial = 0; trial < 20; trial++) {
      const adapter = new VisionKitHandGestureAdapter();
      for (let i = 0; i < 20; i++) {
        const result = adapter.update(anchor(.5, i % 5 === 2 ? .3 : .4), false, i * 40);
        if (result.pinch === 'PINCH_START') falseStarts++;
      }
      adapter.update(anchor(.5, .2), false, 800);
      if (adapter.update(anchor(.5, .2), false, 840).pinch === 'PINCH_START') realStarts++;
    }
    expect(falseStarts).toBe(0);
    expect(realStarts).toBe(20);
  });

  it('preserves a held session across 100ms loss and releases once on genuine opening', () => {
    const adapter = new VisionKitHandGestureAdapter();
    adapter.update(anchor(.5, .2), false, 0);
    const start = adapter.update(anchor(.5, .2), false, 40);
    const lost = adapter.update(undefined, false, 140);
    expect(lost.tracking).toBe('grace');
    expect(lost.pinch).toBeUndefined();
    const recovered = adapter.update(anchor(.5, .2), false, 160);
    expect(recovered.pinch).toBe('PINCH_HOLD');
    expect(recovered.gestureSessionId).toBe(start.gestureSessionId);
    adapter.update(anchor(), false, 200);
    expect(adapter.update(anchor(), false, 240).pinch).toBe('PINCH_END');
  });

  it('locks the pre-pinch target despite a closing fingertip drift, then allows dragging', () => {
    const adapter = new VisionKitHandGestureAdapter();
    for (let at = 0; at <= 200; at += 40) adapter.update(anchor(), false, at);
    adapter.update(anchor(.52, .2), false, 240);
    const grab = adapter.update(anchor(.53, .2), false, 280);
    expect(grab.selectionPoint?.x).toBeCloseTo(.5, 5);
    expect(grab.hand.cursor.x).toBeCloseTo(.5, 5);
    expect(grab.filteredCursor!.x).toBeGreaterThan(.5);
    const drag = adapter.update(anchor(.65, .2), false, 320);
    expect(drag.hand.cursor.x).toBeGreaterThan(.53);
    expect(drag.selectionPoint?.x).toBeCloseTo(.5, 5);
  });

  it('completes three consecutive sessions with no duplicate starts or stuck state', () => {
    const adapter = new VisionKitHandGestureAdapter();
    const starts: number[] = [], ends: number[] = [];
    for (let session = 0; session < 3; session++) {
      for (let i = 0; i < 10; i++) {
        const result = adapter.update(anchor(.5, i < 5 ? .2 : .8), false, session * 400 + i * 40);
        if (result.pinch === 'PINCH_START') starts.push(result.gestureSessionId);
        if (result.pinch === 'PINCH_END') ends.push(result.gestureSessionId);
      }
    }
    expect(starts).toEqual([1, 2, 3]);
    expect(ends).toEqual([1, 2, 3]);
  });

  it.each([.1, .24, .4])('normalizes the same pinch at palm span %s', palm => {
    const adapter = new VisionKitHandGestureAdapter();
    const result = adapter.update(anchor(.5, .2, palm), false, 0);
    expect(result.hand.pinchDistance).toBeCloseTo(.2, 5);
    expect(adapter.update(anchor(.5, .2, palm), false, 40).pinch).toBe('PINCH_START');
  });
});
