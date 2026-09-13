import { GESTURE_CONFIG } from './gesture-config';
import type { VisionKitGestureResult } from './visionkit-hand-tracker';

export type GestureSample = {
  timestamp: number; processedAt: number; uiCompletedAt?: number;
  rawX?: number; rawY?: number; filteredX?: number; filteredY?: number;
  cursorX: number; cursorY: number; velocity: number; confidence?: number;
  palmScale: number; filteredPalmScale: number; rawPinchDistance: number;
  normalizedDistance: number | null; pinchVelocity: number;
  state: string; event?: string; tracking: string; qualityReason: string;
  candidateMs: number; lostMs: number; gestureSessionId: number;
  lockedX?: number; lockedY?: number; dragDistance: number; accepted: boolean;
  confirmationMs: number;
};

/** Bounded, debug-only JS records. No images, landmarks, per-frame JSON or I/O. */
export class GestureTelemetry {
  private rows: Array<GestureSample | undefined>;
  private frameTimes: Array<number | undefined>;
  private next = 0;
  private nextFrame = 0;
  private lastCameraTimestampNs?: number;

  constructor(private readonly enabled: boolean, private readonly capacity = GESTURE_CONFIG.telemetryCapacity,
    private readonly windowMs = GESTURE_CONFIG.telemetryWindowMs) {
    this.rows = enabled ? new Array(capacity) : [];
    this.frameTimes = enabled ? new Array(capacity) : [];
  }

  record(result: VisionKitGestureResult, receivedAt: number, processedAt: number, dragDistance = 0): GestureSample | undefined {
    if (!this.enabled) return;
    const row: GestureSample = {
      timestamp: receivedAt, processedAt, rawX: result.rawCursor?.x, rawY: result.rawCursor?.y,
      filteredX: result.filteredCursor?.x, filteredY: result.filteredCursor?.y,
      cursorX: result.hand.cursor.x, cursorY: result.hand.cursor.y,
      velocity: result.cursorVelocity, confidence: result.confidence,
      palmScale: result.hand.palmScale, filteredPalmScale: result.filteredPalmScale,
      rawPinchDistance: result.hand.rawPinchDistance,
      normalizedDistance: Number.isFinite(result.hand.pinchDistance) ? result.hand.pinchDistance : null,
      pinchVelocity: result.pinchVelocity, state: result.phase, event: result.pinch,
      tracking: result.trackingQuality, qualityReason: result.qualityReason,
      candidateMs: result.candidateDurationMs, lostMs: result.lostDurationMs,
      gestureSessionId: result.gestureSessionId, lockedX: result.selectionPoint?.x, lockedY: result.selectionPoint?.y,
      dragDistance, accepted: result.accepted, confirmationMs: result.confirmationMs,
    };
    this.rows[this.next] = row;
    this.next = (this.next + 1) % this.capacity;
    return row;
  }

  recordCameraFrame(receivedAt: number, cameraTimestampNs?: number): void {
    if (!this.enabled) return;
    // Timestamp is in the native nanosecond clock, NOT Date.now() milliseconds.
    if (cameraTimestampNs !== undefined && cameraTimestampNs === this.lastCameraTimestampNs) return;
    this.lastCameraTimestampNs = cameraTimestampNs;
    this.frameTimes[this.nextFrame] = receivedAt;
    this.nextFrame = (this.nextFrame + 1) % this.capacity;
  }

  markUiComplete(sample: GestureSample | undefined, at: number): void {
    if (sample && at >= sample.processedAt) sample.uiCompletedAt = at;
  }

  snapshot(now = Date.now()): GestureSample[] {
    return this.rows.filter((row): row is GestureSample => !!row && now - row.timestamp <= this.windowMs && now >= row.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  summary(now = Date.now()) {
    const rows = this.snapshot(now);
    const accepted = rows.filter(row => row.accepted);
    const ui = rows.filter(row => row.uiCompletedAt !== undefined);
    const frames = this.frameTimes.filter((at): at is number => at !== undefined && now - at <= this.windowMs && at <= now).sort((a, b) => a - b);
    return {
      samples: rows.length,
      cameraFps: rate(frames), handFps: rate(accepted.map(row => row.timestamp)),
      uiFps: rate(ui.map(row => row.uiCompletedAt!).sort((a, b) => a - b)),
      processingMs: statistics(accepted.map(row => row.processedAt - row.timestamp)),
      callbackToUiMs: statistics(ui.map(row => row.uiCompletedAt! - row.timestamp)),
      pinchConfirmationMs: statistics(rows.filter(row => row.event === 'PINCH_START').map(row => row.confirmationMs)),
      releaseConfirmationMs: statistics(rows.filter(row => row.event === 'PINCH_END').map(row => row.confirmationMs)),
      cameraToHandMs: null,
      cameraToUiMs: null,
      lastCameraTimestampNs: this.lastCameraTimestampNs ?? null,
      timingNote: 'VK anchors have no matched source-frame timestamp; setData callback is UI update completion, not optical display latency.',
    };
  }
}

function rate(times: number[]): number | null {
  if (times.length < 2 || times[times.length - 1] <= times[0]) return null;
  return Math.round((times.length - 1) * 10000 / (times[times.length - 1] - times[0])) / 10;
}

function statistics(values: number[]) {
  const sorted = values.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  return { count: sorted.length,
    average: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
    p95: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : null };
}
