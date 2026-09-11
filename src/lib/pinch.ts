export type NormalizedPoint = {
  x: number;
  y: number;
};

export type PinchEvent = {
  type: 'pinchstart' | 'pinchmove' | 'pinchend';
  point: NormalizedPoint;
};

export type PinchState = {
  isPinching: boolean;
  closedFrames: number;
  openFrames: number;
};

type PinchSample = {
  normalizedDistance: number;
  point: NormalizedPoint;
};

type PinchOptions = {
  enterThreshold: number;
  exitThreshold: number;
  stableFrames: number;
};

const DEFAULT_OPTIONS: PinchOptions = {
  enterThreshold: 0.28,
  exitThreshold: 0.4,
  stableFrames: 3,
};

export function createPinchState(): PinchState {
  return {
    isPinching: false,
    closedFrames: 0,
    openFrames: 0,
  };
}

export function updatePinchState(
  state: PinchState,
  sample: PinchSample,
  options: PinchOptions = DEFAULT_OPTIONS,
): { state: PinchState; event?: PinchEvent } {
  if (!state.isPinching) {
    const closedFrames =
      sample.normalizedDistance < options.enterThreshold
        ? state.closedFrames + 1
        : 0;

    if (closedFrames >= options.stableFrames) {
      return {
        state: { isPinching: true, closedFrames: 0, openFrames: 0 },
        event: { type: 'pinchstart', point: sample.point },
      };
    }

    return {
      state: { ...state, closedFrames, openFrames: 0 },
    };
  }

  const openFrames =
    sample.normalizedDistance > options.exitThreshold
      ? state.openFrames + 1
      : 0;

  if (openFrames >= options.stableFrames) {
    return {
      state: createPinchState(),
      event: { type: 'pinchend', point: sample.point },
    };
  }

  return {
    state: { ...state, closedFrames: 0, openFrames },
    event: { type: 'pinchmove', point: sample.point },
  };
}

