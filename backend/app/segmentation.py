from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class SegmentationResult:
    cutout: np.ndarray
    mask: np.ndarray
    bbox: dict[str, float]


def resize_for_segmentation(image: np.ndarray, max_side: int = 512) -> np.ndarray:
    """Bound GrabCut cost while preserving normalized point and bbox coordinates."""
    height, width = image.shape[:2]
    longest = max(width, height)
    if longest <= max_side:
        return image

    scale = max_side / longest
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA)


def segment_foreground(
    image: np.ndarray,
    point: tuple[float, float],
) -> SegmentationResult:
    """Extract the connected foreground region selected by a normalized point."""
    if image.ndim != 3 or image.shape[2] not in (3, 4):
        raise ValueError("image must have three or four channels")
    if not 0 <= point[0] <= 1 or not 0 <= point[1] <= 1:
        raise ValueError("point must be normalized between 0 and 1")

    bgr = image[:, :, :3]
    height, width = bgr.shape[:2]
    if width < 4 or height < 4:
        raise ValueError("image is too small")

    mask = build_point_prompt_mask(width, height, point)
    background_model = np.zeros((1, 65), dtype=np.float64)
    foreground_model = np.zeros((1, 65), dtype=np.float64)
    cv2.grabCut(
        bgr,
        mask,
        (0, 0, 1, 1),
        background_model,
        foreground_model,
        3,
        cv2.GC_INIT_WITH_MASK,
    )

    foreground = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    foreground = _component_at_point(foreground, point)
    if not np.any(foreground):
        raise ValueError("no foreground found at point")

    x, y, box_width, box_height = cv2.boundingRect(foreground)
    bgra = cv2.cvtColor(bgr, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = foreground
    cutout = bgra[y : y + box_height, x : x + box_width]

    return SegmentationResult(
        cutout=cutout,
        mask=foreground,
        bbox={
            "x": x / width,
            "y": y / height,
            "width": box_width / width,
            "height": box_height / height,
        },
    )


def build_point_prompt_mask(
    width: int,
    height: int,
    point: tuple[float, float],
) -> np.ndarray:
    """Create a GrabCut mask with a small certain-foreground seed at the cursor."""
    mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    left, top, box_width, box_height = _prompt_rectangle(width, height, point)
    mask[top : top + box_height, left : left + box_width] = cv2.GC_PR_FGD

    center_x = round(point[0] * (width - 1))
    center_y = round(point[1] * (height - 1))
    seed_radius = max(2, round(min(width, height) * 0.025))
    cv2.circle(mask, (center_x, center_y), seed_radius, cv2.GC_FGD, thickness=-1)
    return mask


def _prompt_rectangle(
    width: int,
    height: int,
    point: tuple[float, float],
) -> tuple[int, int, int, int]:
    center_x = round(point[0] * (width - 1))
    center_y = round(point[1] * (height - 1))
    box_width = max(2, round(width * 0.72))
    box_height = max(2, round(height * 0.72))
    left = min(max(1, center_x - box_width // 2), width - box_width - 1)
    top = min(max(1, center_y - box_height // 2), height - box_height - 1)
    return left, top, min(box_width, width - left - 1), min(box_height, height - top - 1)


def _component_at_point(mask: np.ndarray, point: tuple[float, float]) -> np.ndarray:
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return mask

    height, width = mask.shape
    point_x = min(width - 1, round(point[0] * (width - 1)))
    point_y = min(height - 1, round(point[1] * (height - 1)))
    label = int(labels[point_y, point_x])
    if label == 0:
        label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return np.where(labels == label, 255, 0).astype(np.uint8)
