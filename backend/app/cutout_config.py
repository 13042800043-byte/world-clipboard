from dataclasses import dataclass


@dataclass(frozen=True)
class CutoutConfig:
    USE_POINT_BOX_FINAL_SEGMENTATION: bool = True
    USE_CONNECTED_COMPONENT_CLEANUP: bool = True
    USE_MASK_MORPHOLOGY: bool = True
    USE_HAND_NEGATIVE_PROMPT: bool = True
    USE_FINE_CUTOUT_MODEL: bool = False
    USE_ALPHA_MATTING: bool = False
    USE_FOREGROUND_DECONTAMINATION: bool = False
    USE_SHARPNESS_GATE: bool = True
    SELECTION_MAX_SIDE: int = 384
    FINAL_MODEL_MAX_SIDE: int = 1024
    FINAL_ROI_EXPAND_RATIO: float = 0.30  # Per-side margin, relative to bbox size.
    MORPHOLOGY_KERNEL: int = 3
    MORPHOLOGY_OPEN_ITERATIONS: int = 1
    MORPHOLOGY_CLOSE_ITERATIONS: int = 1
    MAX_SMALL_HOLE_AREA: int = 12
    MIN_COMPONENT_AREA: int = 16
    COMPONENT_SEARCH_RADIUS: int = 8
    SHARPNESS_THRESHOLD: float = 4.0
    SHARPNESS_ROI_MARGIN: float = 0.15


CUTOUT_CONFIG = CutoutConfig()
