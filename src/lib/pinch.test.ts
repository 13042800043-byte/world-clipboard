import { describe, expect, it } from 'vitest';
import { createPinchState, updatePinchState } from './pinch';

const point = { x: 0.4, y: 0.6 };

describe('updatePinchState', () => {
  it('requires consecutive closed samples before starting a pinch', () => {
    let state = createPinchState();

    state = updatePinchState(state, { normalizedDistance: 0.2, point }).state;
    expect(state.isPinching).toBe(false);

    state = updatePinchState(state, { normalizedDistance: 0.2, point }).state;
    expect(state.isPinching).toBe(false);

    const third = updatePinchState(state, { normalizedDistance: 0.2, point });
    expect(third.state.isPinching).toBe(true);
    expect(third.event?.type).toBe('pinchstart');
  });

  it('uses a wider exit threshold so borderline motion does not release', () => {
    let state = createPinchState();
    for (let index = 0; index < 3; index += 1) {
      state = updatePinchState(state, { normalizedDistance: 0.2, point }).state;
    }

    const borderline = updatePinchState(state, {
      normalizedDistance: 0.34,
      point: { x: 0.45, y: 0.58 },
    });

    expect(borderline.state.isPinching).toBe(true);
    expect(borderline.event?.type).toBe('pinchmove');
  });

  it('requires consecutive open samples before ending a pinch', () => {
    let state = createPinchState();
    for (let index = 0; index < 3; index += 1) {
      state = updatePinchState(state, { normalizedDistance: 0.2, point }).state;
    }

    for (let index = 0; index < 2; index += 1) {
      const update = updatePinchState(state, { normalizedDistance: 0.5, point });
      state = update.state;
      expect(update.event?.type).not.toBe('pinchend');
    }

    const third = updatePinchState(state, { normalizedDistance: 0.5, point });
    expect(third.state.isPinching).toBe(false);
    expect(third.event?.type).toBe('pinchend');
  });
});

