from math import ceil, floor
from time import perf_counter
from typing import Protocol

import cv2
import numpy as np

from app.cutout_config import CUTOUT_CONFIG
from app.mask_refiner import cleanup_mask, refine_mask
from app.segmentation import SegmentationResult, resize_for_segmentation, segment_foreground


class FineCutoutAdapter(Protocol):
    def remove_background(self, image: np.ndarray, coarse_mask: np.ndarray, point: tuple[float, float], negative_points: list[tuple[float, float]]) -> np.ndarray: ...


def expanded_roi(box: dict[str, float], width: int, height: int, ratio: float | None = None) -> tuple[int, int, int, int]:
    # Margin on each side, relative to selected bbox, then clamp to the photo.
    expansion = CUTOUT_CONFIG.FINAL_ROI_EXPAND_RATIO if ratio is None else ratio
    margin_x = box['width'] * expansion
    margin_y = box['height'] * expansion
    left = max(0, floor((box['x'] - margin_x) * width))
    top = max(0, floor((box['y'] - margin_y) * height))
    right = min(width, ceil((box['x'] + box['width'] + margin_x) * width))
    bottom = min(height, ceil((box['y'] + box['height'] + margin_y) * height))
    return left, top, right, bottom


class OpenCVGuidedRefiner:
    """Bounded ROI GrabCut adapter; not SAM, BiRefNet or learned matting."""
    def remove_background(self, image: np.ndarray, coarse_mask: np.ndarray, point: tuple[float, float], negative_points: list[tuple[float, float]]) -> np.ndarray:
        model = resize_for_segmentation(image, CUTOUT_CONFIG.FINAL_MODEL_MAX_SIDE)
        height, width = model.shape[:2]
        mask = cv2.resize(coarse_mask, (width, height), interpolation=cv2.INTER_NEAREST)
        kernel = np.ones((3, 3), np.uint8)
        definite = cv2.erode(mask, kernel)
        probable = cv2.dilate(mask, kernel)
        guidance = np.full((height, width), cv2.GC_BGD, np.uint8)
        guidance[probable > 0] = cv2.GC_PR_FGD
        guidance[definite > 0] = cv2.GC_FGD
        cx, cy = round(point[0] * (width - 1)), round(point[1] * (height - 1))
        cv2.circle(guidance, (cx, cy), 2, cv2.GC_FGD, -1)
        for nx, ny in negative_points:
            if 0 <= nx <= 1 and 0 <= ny <= 1 and np.hypot(nx - point[0], ny - point[1]) > 0.06:
                cv2.circle(guidance, (round(nx * (width - 1)), round(ny * (height - 1))), 2, cv2.GC_BGD, -1)
        # Official mask labels and GC_INIT_WITH_MASK:
        # https://docs.opencv.org/4.x/d8/d83/tutorial_py_grabcut.html
        if np.any(guidance == cv2.GC_BGD) and np.any(guidance == cv2.GC_FGD):
            cv2.grabCut(model, guidance, None, np.zeros((1, 65)), np.zeros((1, 65)), 2, cv2.GC_INIT_WITH_MASK)
        binary = np.where((guidance == cv2.GC_FGD) | (guidance == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        # Only masks are resized. Final RGB is never taken from `model`.
        return cv2.resize(binary, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)


def sharpness_score(image: np.ndarray) -> float:
    sample = resize_for_segmentation(image, 512)
    return float(cv2.Laplacian(cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())


def final_cutout(image: np.ndarray, point: tuple[float, float], box: dict[str, float] | None = None,
                 negative_points: list[tuple[float, float]] | None = None,
                 fine_adapter: FineCutoutAdapter | None = None) -> SegmentationResult:
    started = perf_counter()
    config = CUTOUT_CONFIG
    if config.USE_FINE_CUTOUT_MODEL and fine_adapter is None:
        raise ValueError('fine cutout model flag requires an installed adapter')
    if config.USE_ALPHA_MATTING or config.USE_FOREGROUND_DECONTAMINATION:
        raise ValueError('matting/decontamination adapter is not installed; keep P1 flags off')
    height, width = image.shape[:2]
    negatives = (negative_points or []) if config.USE_HAND_NEGATIVE_PROMPT else []
    coarse_input = resize_for_segmentation(image, config.SELECTION_MAX_SIDE)
    coarse = segment_foreground(coarse_input, point, box=box if config.USE_POINT_BOX_FINAL_SEGMENTATION else None, negative_points=negatives)
    selected_at = perf_counter()
    left, top, right, bottom = expanded_roi(coarse.bbox, width, height)
    roi = image[top:bottom, left:right, :3]
    roi_point = ((round(point[0] * (width - 1)) - left) / max(1, right - left - 1),
                 (round(point[1] * (height - 1)) - top) / max(1, bottom - top - 1))
    if not all(0 <= coordinate <= 1 for coordinate in roi_point):
        raise ValueError('selection point is outside target ROI')
    # Keep the focus check independent from refinement expansion: otherwise
    # enlarging a clean background ROI alone changes the blur decision.
    q_left, q_top, q_right, q_bottom = expanded_roi(coarse.bbox, width, height, config.SHARPNESS_ROI_MARGIN)
    quality = sharpness_score(image[q_top:q_bottom, q_left:q_right, :3])
    # Tiny images are accepted for tests/debug; real high-res captures are gated.
    if config.USE_SHARPNESS_GATE and max(width, height) >= 512 and quality < config.SHARPNESS_THRESHOLD:
        raise ValueError('BLURRY_CAPTURE: hold camera steady and retry')
    # Map mask directly into the original ROI; avoid allocating another full
    # high-res photo mask just to crop it immediately.
    roi_coarse_mask = cv2.warpAffine(coarse.mask, np.array([
        [width / coarse.mask.shape[1], 0, -left],
        [0, height / coarse.mask.shape[0], -top]], np.float32),
        (right-left, bottom-top), flags=cv2.INTER_NEAREST)
    roi_negatives = [((round(nx * (width - 1)) - left) / max(1, right - left - 1),
                      (round(ny * (height - 1)) - top) / max(1, bottom - top - 1)) for nx, ny in negatives]
    refined = (fine_adapter or OpenCVGuidedRefiner()).remove_background(roi, roi_coarse_mask, roi_point, roi_negatives)
    if refined.shape != roi.shape[:2]:
        raise ValueError('fine mask must match original ROI dimensions')
    if config.USE_CONNECTED_COMPONENT_CLEANUP:
        refined = cleanup_mask(refined, roi_point, config.MIN_COMPONENT_AREA, config.COMPONENT_SEARCH_RADIUS)
    if config.USE_MASK_MORPHOLOGY:
        refined = refine_mask(refined)
    if config.USE_CONNECTED_COMPONENT_CLEANUP:
        refined = cleanup_mask(refined, roi_point, config.MIN_COMPONENT_AREA, config.COMPONENT_SEARCH_RADIUS)
    mask = np.zeros((height, width), np.uint8)
    mask[top:bottom, left:right] = refined
    x, y, w, h = cv2.boundingRect(mask)
    if not w or not h:
        raise ValueError('empty final cutout')
    rgba = cv2.cvtColor(image[y:y + h, x:x + w, :3], cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = mask[y:y + h, x:x + w]
    # Debug measurements live outside Clipboard's core model.
    debug = {'sourceWidth': width, 'sourceHeight': height, 'outputWidth': w, 'outputHeight': h,
        'sharpness': quality, 'roi': {'x': left / width, 'y': top / height, 'width': (right-left)/width, 'height': (bottom-top)/height},
        'selectionMs': round((selected_at-started)*1000), 'refineMs': round((perf_counter()-selected_at)*1000),
        'maskAreaRatio': float(np.count_nonzero(mask) / mask.size), 'selectedComponentArea': int(np.count_nonzero(refined)),
        'componentCount': int(cv2.connectedComponents(refined)[0] - 1),
        'point': {'x': point[0], 'y': point[1]}, 'boxPrompt': box, 'negativePointCount': len(negatives),
        'modelMaxSide': config.FINAL_MODEL_MAX_SIDE, 'refiner': 'opencv-guided-roi',
        'totalMs': round((perf_counter()-started)*1000)}
    return SegmentationResult(rgba, mask, {'x': x / width, 'y': y / height, 'width': w / width, 'height': h / height}, debug)
