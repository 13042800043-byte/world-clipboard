import {
  GestureState,
  createInteractionState,
  transitionInteraction,
  type InteractionState,
} from './interaction-state-machine';
import type { NormalizedPoint } from '../vision/hand-tracker';
import { GESTURE_CONFIG } from '../vision/gesture-config';

export class SpatialController {
  private state: InteractionState = createInteractionState();
  private cursor: NormalizedPoint = { x: 0.5, y: 0.56 };
  private selectionPoint: NormalizedPoint = { x: 0.5, y: 0.56 };
  private grabPoint: NormalizedPoint = { x: 0.5, y: 0.56 };
  private sessionId?: number;

  constructor(private readonly dragThreshold = GESTURE_CONFIG.useDragThreshold ? GESTURE_CONFIG.dragActivationDistance : 0) {}

  start(point: NormalizedPoint, selectionPoint = point, sessionId?: number): InteractionState {
    if (this.isDragging() || (sessionId !== undefined && sessionId === this.sessionId)) return this.state;
    this.sessionId = sessionId;
    this.grabPoint = { ...point };
    this.cursor = { ...point };
    this.selectionPoint = { ...selectionPoint };
    this.state = transitionInteraction(this.state, { type: 'HAND_FOUND' });
    this.state = transitionInteraction(this.state, { type: 'TARGET_ENTER' });
    this.state = transitionInteraction(this.state, { type: 'PINCH_START' });
    return this.state;
  }

  move(point: NormalizedPoint): InteractionState {
    if (this.state.gesture === GestureState.GRABBED && this.getDragDistance(point) < this.dragThreshold) return this.state;
    this.cursor = { ...point };
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
    return { ...this.cursor };
  }

  getSelectionPoint(): NormalizedPoint {
    return { ...this.selectionPoint };
  }

  getDragDistance(point = this.cursor): number {
    return Math.hypot(point.x - this.grabPoint.x, point.y - this.grabPoint.y);
  }

  isDragging(): boolean {
    return this.state.gesture === GestureState.GRABBED || this.state.gesture === GestureState.DRAGGING;
  }
}
