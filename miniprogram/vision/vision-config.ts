export const VISION_CONFIG = {
  pinchStartThreshold: 0.34,
  pinchReleaseThreshold: 0.48,
  pinchStartFrames: 2,
  pinchReleaseFrames: 2,
  trackingLostGraceMs: 220,
  selectionLookbackMs: 100,
  selectionHistoryMs: 250,
  cursorFilter: { minCutoff: 1.5, beta: 8, derivativeCutoff: 1 },
  useOneEuroFilter: true,
  useSelectionLock: true,
  showCoordinateDebug: false,
} as const
