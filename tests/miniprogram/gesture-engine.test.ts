import { describe, expect, it } from 'vitest';
import { createPinchTracker, updatePinchTracker } from '../../miniprogram/vision/gesture-engine';

describe('mini program pinch tracker', () => {
  it('uses separate start and release thresholds', () => {
    let tracker = createPinchTracker();
    tracker = updatePinchTracker(tracker, 0.2).tracker;
    const started = updatePinchTracker(tracker, 0.2);
    expect(started.event).toBe('PINCH_START');

    const held = updatePinchTracker(started.tracker, 0.34);
    expect(held.event).toBe('PINCH_HOLD');

    tracker = updatePinchTracker(held.tracker, 0.5).tracker;
    const ended = updatePinchTracker(tracker, 0.5);
    expect(ended.event).toBe('PINCH_END');
  });
});
