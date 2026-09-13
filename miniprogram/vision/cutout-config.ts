// Expensive inference belongs to the backend; final RGB must come from a photo.
export const CUTOUT_CONFIG = {
  USE_HIGH_RES_FINAL_CAPTURE: true,
  // Keep VisionKit alive until it has observed release. Native takePhoto owns
  // the camera exclusively and would otherwise hide the user's opening motion.
  CAPTURE_HAND_PHOTO_ON_RELEASE: true,
  USE_POINT_BOX_FINAL_SEGMENTATION: true,
  USE_HAND_NEGATIVE_PROMPT: true,
  USE_SHARPNESS_GATE: true,
  USE_HOVER_SELECTION: true,
  SELECTION_REQUEST_TIMEOUT_MS: 4000,
  FINAL_REQUEST_TIMEOUT_MS: 25000,
  FINAL_CAPTURE_STABILITY_MS: 180,
  CAMERA_READY_TIMEOUT_MS: 4000,
  HAND_REACQUIRE_TIMEOUT_MS: 1200,
  MAX_RECAPTURE_COUNT: 1,
  RECAPTURE_DELAY_MS: 100,
  HOVER_STABILITY_MS: 250,
  HOVER_REQUEST_INTERVAL_MS: 1000,
  CANDIDATE_MAX_AGE_MS: 1500,
  HOVER_MOVE_THRESHOLD: 0.025,
} as const
