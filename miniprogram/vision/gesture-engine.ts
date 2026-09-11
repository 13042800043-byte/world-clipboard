export type PinchPhase = 'PINCH_START' | 'PINCH_HOLD' | 'PINCH_END';

export type PinchTracker = {
  isPinching: boolean;
  closedFrames: number;
  openFrames: number;
};

const START_THRESHOLD = 0.28;
const RELEASE_THRESHOLD = 0.42;
const STABLE_FRAMES = 2;

export function createPinchTracker(): PinchTracker {
  return { isPinching: false, closedFrames: 0, openFrames: 0 };
}

export function updatePinchTracker(
  tracker: PinchTracker,
  normalizedDistance: number,
): { tracker: PinchTracker; event?: PinchPhase } {
  if (!tracker.isPinching) {
    const closedFrames = normalizedDistance < START_THRESHOLD ? tracker.closedFrames + 1 : 0;
    if (closedFrames >= STABLE_FRAMES) {
      return {
        tracker: { isPinching: true, closedFrames: 0, openFrames: 0 },
        event: 'PINCH_START',
      };
    }
    return { tracker: { ...tracker, closedFrames, openFrames: 0 } };
  }

  const openFrames = normalizedDistance > RELEASE_THRESHOLD ? tracker.openFrames + 1 : 0;
  if (openFrames >= STABLE_FRAMES) {
    return { tracker: createPinchTracker(), event: 'PINCH_END' };
  }
  return {
    tracker: { ...tracker, closedFrames: 0, openFrames },
    event: 'PINCH_HOLD',
  };
}
