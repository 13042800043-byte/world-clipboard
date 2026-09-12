export const VISION_CONFIG = {
  pinchStartThreshold: 0.28,
  pinchReleaseThreshold: 0.42,
  pinchStartFrames: 3,
  pinchReleaseFrames: 3,
  trackingLostGraceMs: 150,
  selectionLookbackMs: 100,
  selectionHistoryMs: 250,
  cursorFilter: { minCutoff: 1.5, beta: 8, derivativeCutoff: 1 },
  useOneEuroFilter: true,
  useSelectionLock: true,
  showCoordinateDebug: true,
} as const
