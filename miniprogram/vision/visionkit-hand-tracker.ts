import {
  createPinchTracker,
  updatePinchTracker,
  type PinchPhase,
  type PinchTracker,
} from './gesture-engine';
import type { HandLandmark, HandResult, NormalizedPoint } from './hand-tracker';

const THUMB_TIP_INDEX = 4;
const INDEX_TIP_INDEX = 8;
const REQUIRED_LANDMARKS = 21;
const MIN_HAND_SIZE = 0.001;

export type VisionKitPoint = NormalizedPoint & { z?: number };

export type VisionKitHandAnchor = {
  points: VisionKitPoint[];
  origin: NormalizedPoint;
  size: { width: number; height: number };
};

export type VisionKitHandResult = HandResult & {
  pinchDistance: number;
};

export type VisionKitGestureResult = {
  hand: VisionKitHandResult;
  pinch?: PinchPhase;
};

export function mapVisionKitAnchor(
  anchor: VisionKitHandAnchor,
  mirrorX = false,
): VisionKitHandResult {
  if (!anchor || anchor.points.length < REQUIRED_LANDMARKS) {
    return emptyHandResult();
  }

  const landmarks = anchor.points.slice(0, REQUIRED_LANDMARKS).map((point) => ({
    x: clamp01(mirrorX ? 1 - point.x : point.x),
    y: clamp01(point.y),
    z: point.z ?? 0,
  }));
  const thumb = landmarks[THUMB_TIP_INDEX];
  const index = landmarks[INDEX_TIP_INDEX];
  const handScale = Math.max(anchor.size.width, anchor.size.height, MIN_HAND_SIZE);

  return {
    detected: true,
    landmarks,
    cursor: midpoint(thumb, index),
    pinchDistance: distance(thumb, index) / handScale,
  };
}

export class VisionKitHandGestureAdapter {
  private pinchTracker: PinchTracker = createPinchTracker();

  update(anchor: VisionKitHandAnchor, mirrorX = false): VisionKitGestureResult {
    const hand = mapVisionKitAnchor(anchor, mirrorX);
    if (!hand.detected) {
      this.reset();
      return { hand };
    }

    const update = updatePinchTracker(this.pinchTracker, hand.pinchDistance);
    this.pinchTracker = update.tracker;
    return { hand, pinch: update.event };
  }

  reset(): void {
    this.pinchTracker = createPinchTracker();
  }
}

function emptyHandResult(): VisionKitHandResult {
  return {
    detected: false,
    landmarks: [],
    cursor: { x: 0.5, y: 0.5 },
    pinchDistance: Number.POSITIVE_INFINITY,
  };
}

function midpoint(a: HandLandmark, b: HandLandmark): NormalizedPoint {
  return {
    x: clamp01((a.x + b.x) / 2),
    y: clamp01((a.y + b.y) / 2),
  };
}

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
