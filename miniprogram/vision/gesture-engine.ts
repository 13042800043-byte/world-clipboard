import { VISION_CONFIG } from './vision-config';

export type PinchPhase = 'PINCH_START' | 'PINCH_HOLD' | 'PINCH_END';

export type PinchTracker = {
  isPinching: boolean;
  closedFrames: number;
  openFrames: number;
  candidateSince?: number;
  lastAt?: number;
  cooldownUntil?: number;
  sessionId: number;
};

export interface PinchOptions {
  pinchStartThreshold: number;
  pinchReleaseThreshold: number;
  pinchStartFrames: number;
  pinchReleaseFrames: number;
  useTimeBasedDebounce?: boolean;
  pinchConfirmMs?: number;
  releaseConfirmMs?: number;
  maxObservationGapMs?: number;
  useRearmCooldown?: boolean;
  rearmCooldownMs?: number;
}

export function createPinchTracker(sessionId = 0): PinchTracker {
  return { isPinching: false, closedFrames: 0, openFrames: 0, sessionId };
}

export function updatePinchTracker(
  tracker: PinchTracker,
  normalizedDistance: number,
  options: PinchOptions = VISION_CONFIG,
  now?: number,
): { tracker: PinchTracker; event?: PinchPhase } {
  if (now !== undefined && (!Number.isFinite(now) || (tracker.lastAt !== undefined && now <= tracker.lastAt))) return { tracker };
  const timed = options.useTimeBasedDebounce && now !== undefined;
  if (timed && tracker.lastAt !== undefined && now - tracker.lastAt > (options.maxObservationGapMs ?? VISION_CONFIG.maxObservationGapMs)) {
    tracker = { ...tracker, closedFrames: 0, openFrames: 0, candidateSince: undefined };
  }
  tracker = { ...tracker, lastAt: now };
  if (!Number.isFinite(normalizedDistance) || normalizedDistance < 0) {
    return { tracker: { ...tracker, closedFrames: 0, openFrames: 0, candidateSince: undefined } };
  }
  if (!tracker.isPinching) {
    if (now !== undefined && now < (tracker.cooldownUntil ?? -Infinity)) return { tracker };
    const closedFrames = normalizedDistance < options.pinchStartThreshold ? tracker.closedFrames + 1 : 0;
    const candidateSince = closedFrames ? tracker.candidateSince ?? now : undefined;
    if (closedFrames >= options.pinchStartFrames && (!timed || now - candidateSince! >= (options.pinchConfirmMs ?? VISION_CONFIG.pinchConfirmMs))) {
      return {
        tracker: { ...tracker, isPinching: true, closedFrames: 0, openFrames: 0, candidateSince: undefined, sessionId: tracker.sessionId + 1 },
        event: 'PINCH_START',
      };
    }
    return { tracker: { ...tracker, closedFrames, openFrames: 0, candidateSince } };
  }

  const openFrames = normalizedDistance > options.pinchReleaseThreshold ? tracker.openFrames + 1 : 0;
  const candidateSince = openFrames ? tracker.candidateSince ?? now : undefined;
  if (openFrames >= options.pinchReleaseFrames && (!timed || now - candidateSince! >= (options.releaseConfirmMs ?? VISION_CONFIG.releaseConfirmMs))) {
    return { tracker: { ...createPinchTracker(tracker.sessionId), lastAt: now,
      cooldownUntil: now !== undefined && options.useRearmCooldown ? now + (options.rearmCooldownMs ?? VISION_CONFIG.rearmCooldownMs) : undefined }, event: 'PINCH_END' };
  }
  return {
    tracker: { ...tracker, closedFrames: 0, openFrames, candidateSince },
    event: 'PINCH_HOLD',
  };
}
