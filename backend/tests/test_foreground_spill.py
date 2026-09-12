"""Regression scenes for connected desktop spill, without a semantic model.

The grey target and grey desktop are deliberately connected. Component cleanup
cannot remove the desktop once GrabCut has labelled it as the same foreground.
These tests constrain prompt scope, not transparent-bottle semantic accuracy.
"""

import cv2
import numpy as np
import pytest

from app.final_cutout import final_cutout
from app.segmentation import build_point_prompt_mask


def connected_target_and_desktop(delta: int) -> np.ndarray:
    image = np.full((300, 400, 3), (45, 125, 40), dtype=np.uint8)
    image[60:200, 165:225] = (190, 190, 190)
    image[200:230, 80:320] = (190 + delta,) * 3
    return image


@pytest.mark.parametrize("desktop_color_delta", [0, 5])
def test_local_point_fallback_does_not_copy_connected_distant_desktop(
    desktop_color_delta: int,
) -> None:
    image = connected_target_and_desktop(desktop_color_delta)
    cv2.setRNGSeed(0)

    result = final_cutout(image, point=(195 / 399, 130 / 299))

    # A local cursor fallback must not treat a wide connected desktop as the
    # selected object. Also forbid passing by returning only the point seed.
    assert np.count_nonzero(result.mask[210:225, 80:320]) == 0
    assert np.count_nonzero(result.mask[60:200, 165:225]) >= 0.90 * 8400


@pytest.mark.parametrize("desktop_color_delta", [0, 5])
def test_candidate_box_excludes_connected_distant_desktop(
    desktop_color_delta: int,
) -> None:
    image = connected_target_and_desktop(desktop_color_delta)
    cv2.setRNGSeed(0)
    # This is an explicit candidate box around the target with 10px margin,
    # not a guessed object bbox derived from a photo.
    candidate_box = {"x": 155 / 400, "y": 50 / 300,
                     "width": 80 / 400, "height": 160 / 300}

    result = final_cutout(image, point=(195 / 399, 130 / 299), box=candidate_box)

    assert np.count_nonzero(result.mask[210:225, 80:320]) == 0
    assert np.count_nonzero(result.mask[60:200, 165:225]) >= 0.90 * 8400


def test_point_fallback_probable_region_is_local_not_majority_of_scene() -> None:
    mask = build_point_prompt_mask(400, 300, point=(0.5, 0.5))
    allowed = (mask == cv2.GC_PR_FGD) | (mask == cv2.GC_FGD)
    # At most half the width and height (25% of the frame), unless a separate
    # candidate bbox is available. The previous 72% × 72% scope was 52%.
    assert np.count_nonzero(allowed) <= mask.size * 0.25


@pytest.mark.parametrize("point", [(0.05, 0.10), (0.95, 0.90), (0.0, 1.0)])
def test_edge_point_fallback_is_clipped_around_cursor_not_shifted_across_scene(
    point: tuple[float, float],
) -> None:
    width, height = 400, 300
    mask = build_point_prompt_mask(width, height, point=point)
    allowed = (mask == cv2.GC_PR_FGD) | (mask == cv2.GC_FGD)
    px, py = round(point[0] * (width - 1)), round(point[1] * (height - 1))
    yy, xx = np.nonzero(allowed)

    assert allowed[py, px]
    assert xx.min() >= max(0, px - width // 4)
    assert xx.max() <= min(width - 1, px + width // 4)
    assert yy.min() >= max(0, py - height // 4)
    assert yy.max() <= min(height - 1, py + height // 4)


def test_candidate_box_preserves_real_thin_rod_instead_of_cutting_connection() -> None:
    image = connected_target_and_desktop(delta=5)
    image[128:131, 225:300] = (190, 190, 190)
    cv2.setRNGSeed(0)
    candidate_box = {"x": 155 / 400, "y": 50 / 300,
                     "width": 155 / 400, "height": 160 / 300}

    result = final_cutout(image, point=(195 / 399, 130 / 299), box=candidate_box)

    assert np.count_nonzero(result.mask[128:131, 225:300]) >= 0.90 * 225
    assert np.count_nonzero(result.mask[60:200, 165:225]) >= 0.90 * 8400
    assert np.count_nonzero(result.mask[215:225, 80:320]) == 0
