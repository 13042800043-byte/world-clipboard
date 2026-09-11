import { describe, expect, it } from 'vitest';
import {
  GestureState,
  createInteractionState,
  transitionInteraction,
} from '../../miniprogram/interaction/interaction-state-machine';

describe('interaction state machine', () => {
  it('moves through hover, grab, drag, release, and idle', () => {
    let state = createInteractionState();
    state = transitionInteraction(state, { type: 'HAND_FOUND' });
    expect(state.gesture).toBe(GestureState.HAND_DETECTED);
    state = transitionInteraction(state, { type: 'TARGET_ENTER' });
    expect(state.gesture).toBe(GestureState.HOVERING);
    state = transitionInteraction(state, { type: 'PINCH_START' });
    expect(state.gesture).toBe(GestureState.GRABBED);
    state = transitionInteraction(state, { type: 'CURSOR_MOVE' });
    expect(state.gesture).toBe(GestureState.DRAGGING);
    state = transitionInteraction(state, { type: 'PINCH_END' });
    expect(state.gesture).toBe(GestureState.RELEASED);
    state = transitionInteraction(state, { type: 'RESET' });
    expect(state.gesture).toBe(GestureState.IDLE);
  });

  it('ignores drag events until an object is grabbed', () => {
    const state = transitionInteraction(createInteractionState(), { type: 'CURSOR_MOVE' });
    expect(state.gesture).toBe(GestureState.IDLE);
  });
});
