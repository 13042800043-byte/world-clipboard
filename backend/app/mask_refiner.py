import cv2
import numpy as np

from app.cutout_config import CUTOUT_CONFIG


def cleanup_mask(mask: np.ndarray, point: tuple[float, float], min_area: int = 16, search_radius: int = 8) -> np.ndarray:
    binary = np.where(mask > 127, 255, 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    height, width = binary.shape
    px, py = round(point[0] * (width - 1)), round(point[1] * (height - 1))
    if not 0 <= px < width or not 0 <= py < height:
        raise ValueError('point must be normalized between 0 and 1')
    selected = int(labels[py, px])
    if selected and stats[selected, cv2.CC_STAT_AREA] >= min_area:
        return np.where(labels == selected, 255, 0).astype(np.uint8)
    # Never choose an unrelated largest component. Search only near the prompt.
    left, top = max(0, px - search_radius), max(0, py - search_radius)
    local = labels[top:min(height, py + search_radius + 1), left:min(width, px + search_radius + 1)]
    yy, xx = np.indices(local.shape)
    distances = (xx + left - px) ** 2 + (yy + top - py) ** 2
    valid = np.zeros(count, dtype=bool)
    valid[1:] = stats[1:, cv2.CC_STAT_AREA] >= min_area
    candidates = valid[local] & (distances <= search_radius ** 2)
    if not np.any(candidates):
        raise ValueError('no sufficiently large foreground near selection point')
    selected = int(local.flat[np.argmin(np.where(candidates, distances, np.inf))])
    return np.where(labels == selected, 255, 0).astype(np.uint8)


def refine_mask(mask: np.ndarray) -> np.ndarray:
    config = CUTOUT_CONFIG
    binary = np.where(mask > 127, 255, 0).astype(np.uint8)
    kernel = np.ones((config.MORPHOLOGY_KERNEL, config.MORPHOLOGY_KERNEL), np.uint8)
    opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel, iterations=config.MORPHOLOGY_OPEN_ITERATIONS)
    # Protect thin structures: reject destructive opening instead of eating ears/rods.
    removed = ((binary > 0) & (opened == 0)).astype(np.uint8)
    _, _, removed_stats, _ = cv2.connectedComponentsWithStats(removed, connectivity=8)
    sizes = removed_stats[1:, cv2.CC_STAT_WIDTH:cv2.CC_STAT_HEIGHT + 1]
    thin_structure = np.any((np.max(sizes, axis=1) >= 5) & (np.min(sizes, axis=1) <= 3)) if len(sizes) else False
    if not thin_structure and np.count_nonzero(opened) >= 0.99 * np.count_nonzero(binary):
        binary = opened
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=config.MORPHOLOGY_CLOSE_ITERATIONS)
    # Fill only small *enclosed* holes; preserve genuine openings and exterior space.
    inverted = np.where(binary == 0, 255, 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(inverted, connectivity=8)
    height, width = binary.shape
    x, y, w, h, area = stats.T
    fill = (x > 0) & (y > 0) & (x + w < width) & (y + h < height) & (area <= config.MAX_SMALL_HOLE_AREA)
    fill[0] = False
    binary[fill[labels]] = 255
    # Closing is restricted to small changes; it cannot globally fill a real hole.
    additions = (closed != 0) & (binary == 0)
    n, groups, areas, _ = cv2.connectedComponentsWithStats(additions.astype(np.uint8), connectivity=8)
    fill = areas[:, cv2.CC_STAT_AREA] <= config.MAX_SMALL_HOLE_AREA
    fill[0] = False
    binary[fill[groups]] = 255
    return binary
