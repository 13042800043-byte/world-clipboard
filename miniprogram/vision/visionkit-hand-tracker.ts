import {
  createPinchTracker,
  updatePinchTracker,
  type PinchPhase,
  type PinchTracker,
} from './gesture-engine';
import type { HandLandmark, HandResult, NormalizedPoint } from './hand-tracker';
import { OneEuroFilter } from './one-euro-filter';
import { VISION_CONFIG } from './vision-config';
import type { PinchOptions } from './gesture-engine';

const THUMB_TIP_INDEX = 4;
const INDEX_TIP_INDEX = 8;
const INDEX_MCP_INDEX = 5;
const PINKY_MCP_INDEX = 17;
const REQUIRED_LANDMARKS = 21;
const MIN_HAND_SIZE = 0.001;
const MIN_PALM_SIZE = 0.02;

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
  rawCursor?: NormalizedPoint;
  selectionPoint?: NormalizedPoint;
  tracking: 'detected' | 'grace' | 'lost';
  phase: 'HOVERING' | 'PINCH_CANDIDATE' | 'GRABBED' | 'RELEASE_CANDIDATE' | 'TRACKING_LOST' | 'REARMING';
  closedFrames: number;
  openFrames: number;
};

export interface HandGestureOptions extends PinchOptions {
  trackingLostGraceMs: number;
  selectionLookbackMs: number;
  selectionHistoryMs: number;
  cursorFilter: { minCutoff: number; beta: number; derivativeCutoff: number };
  useOneEuroFilter: boolean;
  useSelectionLock: boolean;
}

export function mapVisionKitAnchor(
  anchor: VisionKitHandAnchor | undefined,
  mirrorX = false,
  aspectRatio = 1,
): VisionKitHandResult {
  if (!anchor || anchor.points.length < REQUIRED_LANDMARKS ||
      !anchor.points.slice(0, REQUIRED_LANDMARKS).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return emptyHandResult();
  }

  const landmarks = anchor.points.slice(0, REQUIRED_LANDMARKS).map((point) => ({
    x: clamp01(mirrorX ? 1 - point.x : point.x),
    y: clamp01(point.y),
    z: point.z ?? 0,
  }));
  const thumb = landmarks[THUMB_TIP_INDEX];
  const index = landmarks[INDEX_TIP_INDEX];
  const palmSpan = distance(landmarks[INDEX_MCP_INDEX], landmarks[PINKY_MCP_INDEX], aspectRatio);
  const handScale = palmSpan >= MIN_PALM_SIZE
    ? palmSpan
    : Math.max(anchor.size.width * aspectRatio, anchor.size.height, MIN_HAND_SIZE);
  if (!Number.isFinite(handScale)) return emptyHandResult();

  return {
    detected: true,
    landmarks,
    cursor: midpoint(thumb, index),
    pinchDistance: distance(thumb, index, aspectRatio) / handScale,
  };
}

export class VisionKitHandGestureAdapter {
  private pinchTracker: PinchTracker = createPinchTracker();
  private readonly filterX: OneEuroFilter;
  private readonly filterY: OneEuroFilter;
  private lastSeenAt?: number;
  private lastHand?: VisionKitHandResult;
  private history: Array<{ point: NormalizedPoint; at: number }> = [];
  private selectionPoint?: NormalizedPoint;
  private needsRearm = false;
  private rearmFrames = 0;

  constructor(private readonly options: HandGestureOptions = VISION_CONFIG) {
    this.filterX = new OneEuroFilter(options.cursorFilter);
    this.filterY = new OneEuroFilter(options.cursorFilter);
  }

  update(anchor?: VisionKitHandAnchor, mirrorX = false, now = Date.now(), aspectRatio = 1): VisionKitGestureResult {
    const hand = mapVisionKitAnchor(anchor, mirrorX, aspectRatio);
    if (!hand.detected) {
      if (this.lastSeenAt !== undefined && now - this.lastSeenAt < this.options.trackingLostGraceMs && this.lastHand) {
        // No hold/end event on stale data; UI freezes until a real observation arrives.
        this.pinchTracker = { ...this.pinchTracker, closedFrames: 0, openFrames: 0 };
        return this.result(this.lastHand, 'grace', 'TRACKING_LOST');
      }
      const wasPinching = this.pinchTracker.isPinching || this.needsRearm;
      this.reset();
      this.needsRearm = wasPinching;
      return this.result(hand, 'lost', 'TRACKING_LOST');
    }
    // Reacquisition after a long callback gap must not resurrect a stale pinch.
    if (this.lastSeenAt !== undefined && now - this.lastSeenAt >= this.options.trackingLostGraceMs) {
      const wasPinching = this.pinchTracker.isPinching || this.needsRearm;
      this.reset();
      this.needsRearm = wasPinching;
    }
    if (this.lastSeenAt !== undefined && now <= this.lastSeenAt && this.lastHand) {
      // addAnchors/updateAnchors can describe the same observation; it must not
      // count twice toward the three-frame confirmation.
      return this.result(this.lastHand, 'detected', this.needsRearm ? 'REARMING' : this.pinchTracker.isPinching ? 'GRABBED' : this.pinchTracker.closedFrames > 0 ? 'PINCH_CANDIDATE' : 'HOVERING');
    }
    this.lastSeenAt = now;
    const rawCursor = this.pinchTracker.isPinching ? hand.cursor : hand.landmarks[INDEX_TIP_INDEX];
    const cursor = this.options.useOneEuroFilter ? {
      x: this.filterX.filter(rawCursor.x, now),
      y: this.filterY.filter(rawCursor.y, now),
    } : { x: rawCursor.x, y: rawCursor.y };
    const filteredHand = {
      ...hand,
      cursor,
    };
    this.lastHand = filteredHand;
    this.history = this.history.filter(sample => now - sample.at <= this.options.selectionHistoryMs);
    if (this.needsRearm) {
      this.rearmFrames = hand.pinchDistance > this.options.pinchReleaseThreshold ? this.rearmFrames + 1 : 0;
      if (this.rearmFrames >= this.options.pinchReleaseFrames) this.needsRearm = false;
      return { ...this.result(filteredHand, 'detected', 'REARMING'), rawCursor };
    }
    // Freeze history on the first closing frame, before thumb motion shifts the midpoint.
    if (!this.pinchTracker.isPinching && this.pinchTracker.closedFrames === 0 && hand.pinchDistance >= this.options.pinchStartThreshold) {
      this.history.push({ point: { ...cursor }, at: now });
      this.history = this.history.filter(sample => now - sample.at <= this.options.selectionHistoryMs).slice(-60);
    }
    if (!this.pinchTracker.isPinching && this.pinchTracker.closedFrames === 0 && hand.pinchDistance < this.options.pinchStartThreshold) {
      const desiredTime = now - this.options.selectionLookbackMs;
      const sample = [...this.history].reverse().find(sample => sample.at <= desiredTime) ?? this.history[0];
      const stableSamples = sample ? this.history.filter(entry => Math.abs(entry.at - sample.at) <= 40) : [];
      this.selectionPoint = this.options.useSelectionLock && stableSamples.length ? {
        x: median(stableSamples.map(entry => entry.point.x)),
        y: median(stableSamples.map(entry => entry.point.y)),
      } : { ...cursor };
    }
    const update = updatePinchTracker(this.pinchTracker, filteredHand.pinchDistance, this.options);
    this.pinchTracker = update.tracker;
    if (update.event === 'PINCH_END') this.history = [];
    const phase = this.pinchTracker.isPinching
      ? this.pinchTracker.openFrames > 0 ? 'RELEASE_CANDIDATE' : 'GRABBED'
      : this.pinchTracker.closedFrames > 0 ? 'PINCH_CANDIDATE' : 'HOVERING';
    return { ...this.result(filteredHand, 'detected', phase), pinch: update.event, rawCursor };
  }

  private result(hand: VisionKitHandResult, tracking: VisionKitGestureResult['tracking'], phase: VisionKitGestureResult['phase']): VisionKitGestureResult {
    return { hand, tracking, phase, selectionPoint: this.selectionPoint && { ...this.selectionPoint }, closedFrames: this.pinchTracker.closedFrames, openFrames: this.pinchTracker.openFrames };
  }

  reset(): void {
    this.pinchTracker = createPinchTracker();
    this.filterX.reset();
    this.filterY.reset();
    this.lastSeenAt = undefined;
    this.lastHand = undefined;
    this.history = [];
    this.selectionPoint = undefined;
    this.needsRearm = false;
    this.rearmFrames = 0;
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

function distance(a: HandLandmark, b: HandLandmark, aspectRatio = 1): number {
  return Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function median(values: number[]): number {
  const sorted = values.sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
