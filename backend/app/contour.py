"""Contour capture uses the existing mask, never another segmentation pass."""
import cv2
import numpy as np


def contour_preview(cutout: np.ndarray, mask: np.ndarray) -> tuple[np.ndarray, list[list[float]]]:
    """Return a cropped silhouette and outer polygon in full-photo coordinates.

    PNG alpha preserves interior holes; the single polygon represents only the
    largest outer ring. OpenCV contour approximation preserves concavities:
    https://docs.opencv.org/4.x/dd/d49/tutorial_py_contour_features.html
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError('empty contour')
    outer = max(contours, key=cv2.contourArea)
    if cv2.contourArea(outer) <= 0:
        raise ValueError('empty contour')
    epsilon = max(.5, cv2.arcLength(outer, True) * .0005)
    polygon = cv2.approxPolyDP(outer, epsilon, True)
    # Bound mobile payload size without blindly dropping vertices / topology.
    for _ in range(12):
        if len(polygon) <= 1024:
            break
        epsilon *= 2
        polygon = cv2.approxPolyDP(outer, epsilon, True)
    if not 3 <= len(polygon) <= 1024:
        raise ValueError('invalid contour geometry')
    height, width = mask.shape
    normalized = [[float(x) / max(1, width - 1), float(y) / max(1, height - 1)]
                  for x, y in polygon.reshape(-1, 2)]
    silhouette = cutout.copy()
    silhouette[:, :, :3] = 17
    return silhouette, normalized
