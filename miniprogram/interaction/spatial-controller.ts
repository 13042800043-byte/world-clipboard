import {
  GestureState,
  createInteractionState,
  transitionInteraction,
  type InteractionState,
} from './interaction-state-machine';
import type { NormalizedPoint } from '../vision/hand-tracker';

export class SpatialController {
  private state: InteractionState = createInteractionState();
  private cursor: NormalizedPoint = { x: 0.5, y: 0.56 };

  start(point: NormalizedPoint): InteractionState {
    this.cursor = point;
    this.state = transitionInteraction(this.state, { type: 'HAND_FOUND' });
    this.state = transitionInteraction(this.state, { type: 'TARGET_ENTER' });
    this.state = transitionInteraction(this.state, { type: 'PINCH_START' });
    return this.state;
  }

  move(point: NormalizedPoint): InteractionState {
    this.cursor = point;
    this.state = transitionInteraction(this.state, { type: 'CURSOR_MOVE' });
    return this.state;
  }

  release(): InteractionState {
    this.state = transitionInteraction(this.state, { type: 'PINCH_END' });
    return this.state;
  }

  reset(): InteractionState {
    this.state = transitionInteraction(this.state, { type: 'RESET' });
    return this.state;
  }

  getCursor(): NormalizedPoint {
    return this.cursor;
  }

  isDragging(): boolean {
    return this.state.gesture === GestureState.GRABBED || this.state.gesture === GestureState.DRAGGING;
  }
}
