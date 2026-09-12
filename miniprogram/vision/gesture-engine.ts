import { VISION_CONFIG } from './vision-config';

export type PinchPhase = 'PINCH_START' | 'PINCH_HOLD' | 'PINCH_END';

export type PinchTracker = {
  isPinching: boolean;
  closedFrames: number;
  openFrames: number;
};

export interface PinchOptions {
  pinchStartThreshold: number;
  pinchReleaseThreshold: number;
  pinchStartFrames: number;
  pinchReleaseFrames: number;
}

export function createPinchTracker(): PinchTracker {
  return { isPinching: false, closedFrames: 0, openFrames: 0 };
}

export function updatePinchTracker(
  tracker: PinchTracker,
  normalizedDistance: number,
  options: PinchOptions = VISION_CONFIG,
): { tracker: PinchTracker; event?: PinchPhase } {
  if (!Number.isFinite(normalizedDistance) || normalizedDistance < 0) {
    return { tracker: { ...tracker, closedFrames: 0, openFrames: 0 } };
  }
  if (!tracker.isPinching) {
    const closedFrames = normalizedDistance < options.pinchStartThreshold ? tracker.closedFrames + 1 : 0;
    if (closedFrames >= options.pinchStartFrames) {
      return {
        tracker: { isPinching: true, closedFrames: 0, openFrames: 0 },
        event: 'PINCH_START',
      };
    }
    return { tracker: { ...tracker, closedFrames, openFrames: 0 } };
  }

  const openFrames = normalizedDistance > options.pinchReleaseThreshold ? tracker.openFrames + 1 : 0;
  if (openFrames >= options.pinchReleaseFrames) {
    return { tracker: createPinchTracker(), event: 'PINCH_END' };
  }
  return {
    tracker: { ...tracker, closedFrames: 0, openFrames },
    event: 'PINCH_HOLD',
  };
}
