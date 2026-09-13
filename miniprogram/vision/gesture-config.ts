// Current is the pre-round-2 baseline; stable changes timing/guards without
// simultaneously changing the tuned distance thresholds or cursor filter.
const current = {
  pinchStartThreshold: 0.34, pinchReleaseThreshold: 0.48,
  pinchStartFrames: 2, pinchReleaseFrames: 2,
  pinchConfirmMs: 30, releaseConfirmMs: 30, maxObservationGapMs: 120,
  rearmCooldownMs: 80,
  trackingLostGraceMs: 220, grabbedTrackingGraceMs: 300, trackingUnstableMs: 100,
  selectionLookbackMs: 100, selectionHistoryMs: 250, selectionWindowMs: 40,
  selectionMaxVelocity: 0.35, selectionHistoryCapacity: 60,
  cursorFilter: { minCutoff: 1.5, beta: 8, derivativeCutoff: 1 },
  palmFilter: { minCutoff: 5, beta: 1, derivativeCutoff: 1 },
  minimumPalmSize: 0.02, minimumHandSize: 0.001,
  confidenceThreshold: 0.4, edgeMargin: 0.025,
  cursorDeadZone: 0.001, dragActivationDistance: 0.012,
  useOneEuroFilter: true, useSelectionLock: true,
  useTimeBasedDebounce: false, usePalmScaleFilter: false,
  useTrackingGrace: true, useExtendedGrabGrace: false,
  useConfidenceGate: false, useEdgeGate: false,
  useCursorDeadZone: false, useContinuousCursor: false,
  useDragThreshold: false, useRearmCooldown: false,
  useVelocityAdaptiveFilter: true, useStableHistory: false,
  useObservationGuard: false, duplicateWindowMs: 8,
  useFrameCadenceCompensation: false,
  showCoordinateDebug: false,
  telemetryWindowMs: 10000, telemetryCapacity: 600, debugUpdateIntervalMs: 200,
};

export type GestureConfig = typeof current;
const stable: GestureConfig = {
  ...current,
  useTimeBasedDebounce: true, usePalmScaleFilter: true,
  // Native confidence metadata has not been calibrated on target phones.
  // Keep logging it; hard rejection is opt-in until device samples validate it.
  useExtendedGrabGrace: true, useConfidenceGate: false, useEdgeGate: true,
  useCursorDeadZone: true, useContinuousCursor: true, useDragThreshold: true,
  useRearmCooldown: true, useStableHistory: true,
  useObservationGuard: true, useFrameCadenceCompensation: true,
};
export const GESTURE_PROFILES: Record<'current' | 'stable' | 'responsive' | 'debug', GestureConfig> = {
  current, stable,
  responsive: { ...stable, pinchConfirmMs: 20, releaseConfirmMs: 25,
    cursorFilter: { minCutoff: 1.8, beta: 10, derivativeCutoff: 1 } },
  debug: { ...stable, showCoordinateDebug: true },
};
export type GestureProfile = keyof typeof GESTURE_PROFILES;
export const GESTURE_PROFILE: GestureProfile = 'stable';
export const GESTURE_CONFIG = GESTURE_PROFILES[GESTURE_PROFILE];
