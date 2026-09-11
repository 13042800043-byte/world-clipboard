export enum GestureState {
  IDLE = 'IDLE',
  HAND_DETECTED = 'HAND_DETECTED',
  HOVERING = 'HOVERING',
  PINCH_START = 'PINCH_START',
  GRABBED = 'GRABBED',
  DRAGGING = 'DRAGGING',
  RELEASED = 'RELEASED',
}

export type InteractionState = {
  gesture: GestureState;
  hasHand: boolean;
  hasTarget: boolean;
};

export type InteractionEvent =
  | { type: 'HAND_FOUND' }
  | { type: 'HAND_LOST' }
  | { type: 'TARGET_ENTER' }
  | { type: 'TARGET_LEAVE' }
  | { type: 'PINCH_START' }
  | { type: 'CURSOR_MOVE' }
  | { type: 'PINCH_END' }
  | { type: 'RESET' };

export function createInteractionState(): InteractionState {
  return { gesture: GestureState.IDLE, hasHand: false, hasTarget: false };
}

export function transitionInteraction(
  state: InteractionState,
  event: InteractionEvent,
): InteractionState {
  switch (event.type) {
    case 'HAND_FOUND':
      return { gesture: GestureState.HAND_DETECTED, hasHand: true, hasTarget: false };
    case 'HAND_LOST':
    case 'RESET':
      return createInteractionState();
    case 'TARGET_ENTER':
      return state.hasHand
        ? { ...state, gesture: GestureState.HOVERING, hasTarget: true }
        : state;
    case 'TARGET_LEAVE':
      return state.hasHand
        ? { ...state, gesture: GestureState.HAND_DETECTED, hasTarget: false }
        : state;
    case 'PINCH_START':
      return state.hasTarget
        ? { ...state, gesture: GestureState.GRABBED }
        : state;
    case 'CURSOR_MOVE':
      return state.gesture === GestureState.GRABBED || state.gesture === GestureState.DRAGGING
        ? { ...state, gesture: GestureState.DRAGGING }
        : state;
    case 'PINCH_END':
      return state.gesture === GestureState.GRABBED || state.gesture === GestureState.DRAGGING
        ? { ...state, gesture: GestureState.RELEASED }
        : state;
  }
}
