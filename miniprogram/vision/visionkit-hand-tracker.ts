import {
  createPinchTracker,
  updatePinchTracker,
  type PinchPhase,
  type PinchTracker,
} from './gesture-engine';
import type { HandLandmark, HandResult, NormalizedPoint } from './hand-tracker';
import { OneEuroFilter } from './one-euro-filter';
import { VISION_CONFIG } from './vision-config';
import type { GestureConfig } from './gesture-config';

const THUMB_TIP_INDEX = 4;
const INDEX_TIP_INDEX = 8;
const INDEX_MCP_INDEX = 5;
const PINKY_MCP_INDEX = 17;
const REQUIRED_LANDMARKS = 21;

export type VisionKitPoint = NormalizedPoint & { z?: number };

export type VisionKitHandAnchor = {
  type?: number;
  points: VisionKitPoint[];
  origin: NormalizedPoint;
  size: { width: number; height: number };
  score?: number;
  confidence?: number[];
  id?: number;
  detectId?: number;
};

export type VisionKitHandResult = HandResult & {
  pinchDistance: number;
  rawPinchDistance: number;
  palmScale: number;
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
  gestureSessionId: number;
  candidateDurationMs: number;
  lostDurationMs: number;
  trackingQuality: 'TRACKING_OK' | 'TRACKING_UNSTABLE' | 'TRACKING_LOST';
  confidence?: number;
  qualityReason: string;
  filteredPalmScale: number;
  filteredCursor?: NormalizedPoint;
  cursorVelocity: number;
  pinchVelocity: number;
  accepted: boolean;
  graceRemainingMs: number;
  confirmationMs: number;
};

export type HandGestureOptions = GestureConfig;

/** Native callbacks may also contain plane/removal anchors without landmarks. */
export function isVisionKitHandAnchor(value: unknown): value is VisionKitHandAnchor {
  if (!value || typeof value !== 'object') return false;
  const anchor = value as Partial<VisionKitHandAnchor>;
  if (anchor.type !== undefined && anchor.type !== 7) return false;
  if (!Array.isArray(anchor.points) || anchor.points.length < REQUIRED_LANDMARKS) return false;
  for (let i = 0; i < REQUIRED_LANDMARKS; i++) {
    const point = anchor.points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  }
  return !!anchor.size && Number.isFinite(anchor.size.width) && Number.isFinite(anchor.size.height);
}

export function mapVisionKitAnchor(
  anchor: VisionKitHandAnchor | undefined,
  mirrorX = false,
  aspectRatio = 1,
  options: HandGestureOptions = VISION_CONFIG,
): VisionKitHandResult {
  if (!isVisionKitHandAnchor(anchor)) {
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
  const handScale = palmSpan >= options.minimumPalmSize
    ? palmSpan
    : Math.max(anchor.size.width * aspectRatio, anchor.size.height, options.minimumHandSize);
  if (!Number.isFinite(handScale)) return emptyHandResult();

  return {
    detected: true,
    landmarks,
    cursor: midpoint(thumb, index),
    pinchDistance: distance(thumb, index, aspectRatio) / handScale,
    rawPinchDistance: distance(thumb, index, aspectRatio),
    palmScale: handScale,
  };
}

export class VisionKitHandGestureAdapter {
  private pinchTracker: PinchTracker = createPinchTracker();
  private readonly filterX: OneEuroFilter;
  private readonly filterY: OneEuroFilter;
  private readonly palmFilter: OneEuroFilter;
  private filteredPalmScale = 0;
  private rawCursor?: NormalizedPoint;
  private filteredCursor?: NormalizedPoint;
  private cursorVelocity = 0;
  private pinchVelocity = 0;
  private lastProcessedAt?: number;
  private confidence?: number;
  private qualityReason = '';
  private lastDetectId?: number;
  private handId?: number;
  private accepted = false;
  private lostDurationMs = 0;
  private holdOrigin?: NormalizedPoint;
  private resumeCursor?: NormalizedPoint;
  private dragActive = false;
  private confirmationMs = 0;
  private lastSeenAt?: number;
  private lastHand?: VisionKitHandResult;
  private history: Array<{ point: NormalizedPoint; at: number; velocity: number }> = [];
  private selectionPoint?: NormalizedPoint;
  private needsRearm = false;
  private rearmFrames = 0;
  private rearmSince?: number;

  constructor(private readonly options: HandGestureOptions = VISION_CONFIG) {
    const cursorFilter = { ...options.cursorFilter, beta: options.useVelocityAdaptiveFilter ? options.cursorFilter.beta : 0 };
    this.filterX = new OneEuroFilter(cursorFilter);
    this.filterY = new OneEuroFilter(cursorFilter);
    this.palmFilter = new OneEuroFilter(options.palmFilter);
  }

  update(anchor?: VisionKitHandAnchor, mirrorX = false, now = Date.now(), aspectRatio = 1): VisionKitGestureResult {
    this.accepted = false;
    this.confirmationMs = 0;
    if (!Number.isFinite(now) || (this.lastProcessedAt !== undefined && now <= this.lastProcessedAt)) {
      return this.result(this.lastHand ?? emptyHandResult(), this.lastHand ? 'detected' : 'lost', this.phase());
    }
    this.lastProcessedAt = now;
    const hand = mapVisionKitAnchor(anchor, mirrorX, aspectRatio, this.options);
    this.confidence = readConfidence(anchor);
    const weak = this.options.useConfidenceGate && this.confidence !== undefined && this.confidence < this.options.confidenceThreshold;
    // detectId is not a documented frame timestamp. Coalesce only identical
    // near-simultaneous callbacks; later stationary observations remain valid.
    const duplicate = this.options.useObservationGuard && anchor?.detectId !== undefined
      && anchor.detectId === this.lastDetectId && anchor.id === this.handId
      && this.lastSeenAt !== undefined && now - this.lastSeenAt < this.options.duplicateWindowMs
      && this.lastHand && [4, 8, 5, 17].every(i => hand.landmarks[i]?.x === this.lastHand!.landmarks[i]?.x && hand.landmarks[i]?.y === this.lastHand!.landmarks[i]?.y);
    this.qualityReason = weak ? 'LOW_CONFIDENCE' : duplicate ? 'DUPLICATE_OBSERVATION' : !hand.detected ? 'NO_HAND' : '';
    if (!hand.detected || weak || duplicate) {
      this.lostDurationMs = this.lastSeenAt === undefined ? 0 : now - this.lastSeenAt;
      if (this.lastSeenAt !== undefined && this.lostDurationMs < this.graceMs() && this.lastHand) {
        // No hold/end event on stale data; UI freezes until a real observation arrives.
        if (!duplicate) this.clearCandidates();
        return this.result(this.lastHand, 'grace', 'TRACKING_LOST');
      }
      const wasPinching = this.pinchTracker.isPinching || this.needsRearm;
      const lostMs = this.lostDurationMs;
      const confidence = this.confidence;
      this.reset();
      this.confidence = confidence;
      this.lastProcessedAt = now;
      this.lostDurationMs = lostMs;
      this.needsRearm = wasPinching;
      return this.result(emptyHandResult(), 'lost', 'TRACKING_LOST');
    }
    // Reacquisition after a long callback gap must not resurrect a stale pinch.
    const changedHand = anchor?.id !== undefined && this.handId !== undefined && anchor.id !== this.handId;
    if (changedHand || (this.lastSeenAt !== undefined && now - this.lastSeenAt >=
        (this.options.useTrackingGrace ? this.graceMs() : this.options.trackingLostGraceMs))) {
      const wasPinching = this.pinchTracker.isPinching || this.needsRearm;
      this.reset();
      this.needsRearm = wasPinching;
    }
    this.confidence = readConfidence(anchor);
    const dt = this.lastSeenAt === undefined ? 0 : (now - this.lastSeenAt) / 1000;
    this.accepted = true;
    this.lastProcessedAt = now;
    this.lostDurationMs = 0;
    this.handId = anchor?.id;
    this.lastDetectId = anchor?.detectId;
    this.filteredPalmScale = this.options.usePalmScaleFilter ? this.palmFilter.filter(hand.palmScale, now) : hand.palmScale;
    hand.pinchDistance = hand.rawPinchDistance / this.filteredPalmScale;
    this.pinchVelocity = dt && this.lastHand ? (hand.pinchDistance - this.lastHand.pinchDistance) / dt : 0;
    this.lastSeenAt = now;
    const rawCursor = !this.options.useContinuousCursor && this.pinchTracker.isPinching ? hand.cursor : hand.landmarks[INDEX_TIP_INDEX];
    let cursor = this.options.useOneEuroFilter ? {
      x: this.filterX.filter(rawCursor.x, now),
      y: this.filterY.filter(rawCursor.y, now),
    } : { x: rawCursor.x, y: rawCursor.y };
    this.rawCursor = rawCursor;
    this.cursorVelocity = dt && this.filteredCursor ? distance(cursor, this.filteredCursor, aspectRatio) / dt : 0;
    if (this.options.useCursorDeadZone && this.filteredCursor && distance(cursor, this.filteredCursor, aspectRatio) < this.options.cursorDeadZone) cursor = this.filteredCursor;
    this.filteredCursor = cursor;
    // Native tracking restarts after taking a photo. Rebase the drag origin
    // once so the first new observation cannot move an already locked object.
    if (this.resumeCursor && this.selectionPoint && this.pinchTracker.isPinching) {
      this.holdOrigin = { x: cursor.x - (this.resumeCursor.x - this.selectionPoint.x),
        y: cursor.y - (this.resumeCursor.y - this.selectionPoint.y) };
    }
    this.resumeCursor = undefined;
    const filteredHand = {
      ...hand,
      cursor,
    };
    this.lastHand = filteredHand;
    this.history = this.history.filter(sample => now - sample.at <= this.options.selectionHistoryMs);
    if (this.needsRearm) {
      this.rearmFrames = hand.pinchDistance > this.options.pinchReleaseThreshold ? this.rearmFrames + 1 : 0;
      this.rearmSince = this.rearmFrames ? this.rearmSince ?? now : undefined;
      if (this.rearmFrames >= this.options.pinchReleaseFrames && (!this.options.useTimeBasedDebounce || now - this.rearmSince! >= this.options.releaseConfirmMs)) this.needsRearm = false;
      return { ...this.result(filteredHand, 'detected', 'REARMING'), rawCursor };
    }
    const nearEdge = this.options.useEdgeGate && [hand.landmarks[4], hand.landmarks[8]].some(point =>
      point.x < this.options.edgeMargin || point.x > 1 - this.options.edgeMargin || point.y < this.options.edgeMargin || point.y > 1 - this.options.edgeMargin);
    if (nearEdge && !this.pinchTracker.isPinching) {
      this.qualityReason = 'LOW_CONFIDENCE_ZONE';
      this.clearCandidates();
      return this.result(filteredHand, 'detected', 'HOVERING');
    }
    // Freeze history on the first closing frame, before thumb motion shifts the midpoint.
    if (!this.pinchTracker.isPinching && this.pinchTracker.closedFrames === 0 && hand.pinchDistance >= this.options.pinchStartThreshold) {
      this.history.push({ point: { ...cursor }, at: now, velocity: this.cursorVelocity });
      if (this.history.length > this.options.selectionHistoryCapacity) this.history.shift();
    }
    if (!this.pinchTracker.isPinching && this.pinchTracker.closedFrames === 0 && hand.pinchDistance < this.options.pinchStartThreshold) {
      const desiredTime = now - this.options.selectionLookbackMs;
      const sample = [...this.history].reverse().find(sample => sample.at <= desiredTime) ?? this.history[0];
      const samples = sample ? this.history.filter(entry => Math.abs(entry.at - sample.at) <= this.options.selectionWindowMs) : [];
      const slowSamples = this.options.useStableHistory ? samples.filter(entry => entry.velocity <= this.options.selectionMaxVelocity) : samples;
      const stableSamples = slowSamples.length ? slowSamples : samples;
      this.selectionPoint = this.options.useSelectionLock && stableSamples.length ? {
        x: median(stableSamples.map(entry => entry.point.x)),
        y: median(stableSamples.map(entry => entry.point.y)),
      } : { ...cursor };
    }
    const candidateSince = this.pinchTracker.candidateSince;
    const update = updatePinchTracker(this.pinchTracker, filteredHand.pinchDistance, this.options, now);
    this.pinchTracker = update.tracker;
    this.confirmationMs = update.event === 'PINCH_START' || update.event === 'PINCH_END' ? now - (candidateSince ?? now) : 0;
    if (update.event === 'PINCH_START') {
      this.holdOrigin = { ...cursor };
      this.dragActive = false;
    }
    if (this.options.useSelectionLock && this.options.useDragThreshold && this.selectionPoint && this.holdOrigin && this.pinchTracker.isPinching) {
      const dx = cursor.x - this.holdOrigin.x, dy = cursor.y - this.holdOrigin.y;
      if (Math.hypot(dx, dy) >= this.options.dragActivationDistance) this.dragActive = true;
      filteredHand.cursor = this.dragActive ? { x: clamp01(this.selectionPoint.x + dx), y: clamp01(this.selectionPoint.y + dy) } : { ...this.selectionPoint };
    }
    if (update.event === 'PINCH_END') this.history = [];
    return { ...this.result(filteredHand, 'detected', this.phase()), pinch: update.event, rawCursor };
  }

  private phase(): VisionKitGestureResult['phase'] {
    return this.needsRearm ? 'REARMING' : this.pinchTracker.isPinching
      ? this.pinchTracker.openFrames > 0 ? 'RELEASE_CANDIDATE' : 'GRABBED'
      : this.pinchTracker.closedFrames > 0 ? 'PINCH_CANDIDATE' : 'HOVERING';
  }

  private graceMs(): number {
    return !this.options.useTrackingGrace ? 0 : this.options.useExtendedGrabGrace && this.pinchTracker.isPinching
      ? this.options.grabbedTrackingGraceMs : this.options.trackingLostGraceMs;
  }

  private clearCandidates(): void {
    this.pinchTracker = { ...this.pinchTracker, closedFrames: 0, openFrames: 0, candidateSince: undefined };
    this.rearmFrames = 0;
    this.rearmSince = undefined;
  }

  private result(hand: VisionKitHandResult, tracking: VisionKitGestureResult['tracking'], phase: VisionKitGestureResult['phase']): VisionKitGestureResult {
    return { hand, tracking, phase, selectionPoint: this.selectionPoint && { ...this.selectionPoint }, closedFrames: this.pinchTracker.closedFrames, openFrames: this.pinchTracker.openFrames,
      rawCursor: this.rawCursor, filteredCursor: this.filteredCursor,
      gestureSessionId: this.pinchTracker.sessionId, confidence: this.confidence, qualityReason: this.qualityReason,
      filteredPalmScale: this.filteredPalmScale, cursorVelocity: this.cursorVelocity, pinchVelocity: this.pinchVelocity,
      candidateDurationMs: this.pinchTracker.candidateSince === undefined ? 0 : (this.lastProcessedAt ?? 0) - this.pinchTracker.candidateSince,
      lostDurationMs: this.lostDurationMs, accepted: this.accepted,
      confirmationMs: this.confirmationMs,
      graceRemainingMs: Math.max(0, this.graceMs() - this.lostDurationMs),
      trackingQuality: tracking === 'lost' ? 'TRACKING_LOST' : tracking === 'grace' && this.lostDurationMs >= this.options.trackingUnstableMs ? 'TRACKING_UNSTABLE' : 'TRACKING_OK' };
  }

  // Only the camera ownership controller may call this after an intentional
  // photo pause. Ordinary missing observations use the configured grace.
  resumeAfterCapture(now = Date.now()): void {
    if (this.lastSeenAt !== undefined) this.lastSeenAt = now;
    this.filterX.reset();
    this.filterY.reset();
    this.palmFilter.reset();
    this.lastDetectId = this.handId = undefined;
    if (this.options.useContinuousCursor && this.pinchTracker.isPinching && this.lastHand) this.resumeCursor = { ...this.lastHand.cursor };
    this.clearCandidates();
  }

  reset(): void {
    this.pinchTracker = createPinchTracker(this.pinchTracker.sessionId);
    this.filterX.reset();
    this.filterY.reset();
    this.lastSeenAt = undefined;
    this.palmFilter.reset();
    this.filteredPalmScale = 0;
    this.rawCursor = this.filteredCursor = undefined;
    this.lastProcessedAt = undefined;
    this.lastDetectId = this.handId = undefined;
    this.confidence = undefined;
    this.cursorVelocity = this.pinchVelocity = this.lostDurationMs = 0;
    this.accepted = false;
    this.holdOrigin = undefined;
    this.resumeCursor = undefined;
    this.dragActive = false;
    this.confirmationMs = 0;
    this.lastHand = undefined;
    this.history = [];
    this.selectionPoint = undefined;
    this.needsRearm = false;
    this.rearmFrames = 0;
    this.rearmSince = undefined;
  }
}

function emptyHandResult(): VisionKitHandResult {
  return {
    detected: false,
    landmarks: [],
    cursor: { x: 0.5, y: 0.5 },
    pinchDistance: Number.POSITIVE_INFINITY,
    rawPinchDistance: 0,
    palmScale: 0,
  };
}

function midpoint(a: HandLandmark, b: HandLandmark): NormalizedPoint {
  return {
    x: clamp01((a.x + b.x) / 2),
    y: clamp01((a.y + b.y) / 2),
  };
}

function distance(a: NormalizedPoint, b: NormalizedPoint, aspectRatio = 1): number {
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

// VKHandAnchor.score and confidence are documented in official API typings.
// Missing metadata is unknown, not a fabricated confidence of 1 or 0.
function readConfidence(anchor?: VisionKitHandAnchor): number | undefined {
  if (!anchor) return undefined;
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  let result = valid(anchor.score) ? anchor.score : undefined;
  const confidence = anchor.confidence;
  if (confidence && confidence.length >= REQUIRED_LANDMARKS && [4, 8, 5, 17].every(index => valid(confidence[index]))) {
    for (const index of [4, 8, 5, 17]) {
      result = Math.min(result ?? 1, confidence[index]);
    }
  }
  return result;
}
