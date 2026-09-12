"""Regression coverage for the final, original-resolution object cutout."""

import numpy as np
import pytest

from app.final_cutout import cleanup_mask, final_cutout, refine_mask


def test_final_cutout_preserves_original_resolution_and_fine_color_detail() -> None:
    image = np.empty((800, 1200, 3), dtype=np.uint8)
    image[:] = (35, 170, 40)
    yy, xx = np.indices((400, 500))
    checker = (xx + yy) % 2 == 0
    object_pixels = np.empty((400, 500, 3), dtype=np.uint8)
    object_pixels[:] = (25, 30, 220)
    object_pixels[checker] = (55, 45, 245)
    image[200:600, 350:850] = object_pixels

    result = final_cutout(image, point=(0.5, 0.5))

    # Inference may be bounded, but neither the output alpha nor RGB may use
    # that small inference image as their final source.
    assert result.mask.shape == (800, 1200)
    x = round(result.bbox["x"] * 1200)
    y = round(result.bbox["y"] * 800)
    width = round(result.bbox["width"] * 1200)
    height = round(result.bbox["height"] * 800)
    assert width >= 490
    assert height >= 390
    assert result.cutout.shape == (height, width, 4)
    np.testing.assert_array_equal(
        result.cutout[:, :, :3], image[y : y + height, x : x + width]
    )
    interior = result.cutout[300 - y : 320 - y, 500 - x : 520 - x]
    assert np.all(interior[:, :, 3] == 255)
    assert len(np.unique(interior[:, :, :3].reshape(-1, 3), axis=0)) == 2


def test_cleanup_mask_keeps_selected_component_not_larger_unrelated_object() -> None:
    mask = np.zeros((100, 140), dtype=np.uint8)
    mask[30:60, 10:35] = 255
    mask[10:90, 70:135] = 255

    cleaned = cleanup_mask(mask, point=(20 / 139, 45 / 99))

    np.testing.assert_array_equal(cleaned[:, :50], mask[:, :50])
    assert np.count_nonzero(cleaned[:, 50:]) == 0


def test_cleanup_mask_searches_near_prompt_when_point_is_just_outside_mask() -> None:
    mask = np.zeros((80, 120), dtype=np.uint8)
    mask[20:50, 20:40] = 255
    mask[5:75, 75:115] = 255

    cleaned = cleanup_mask(mask, point=(43 / 119, 35 / 79), search_radius=8)

    assert cleaned[35, 30] == 255
    assert cleaned[35, 90] == 0
    assert np.count_nonzero(cleaned) == 30 * 20


def test_cleanup_mask_rejects_tiny_prompt_noise_without_selecting_distant_giant() -> None:
    mask = np.zeros((100, 140), dtype=np.uint8)
    mask[44:46, 19:21] = 255
    mask[10:90, 70:135] = 255

    with pytest.raises(ValueError, match="foreground"):
        cleanup_mask(mask, point=(20 / 139, 45 / 99), min_area=16)


def test_cleanup_mask_does_not_fall_back_to_a_distant_component() -> None:
    mask = np.zeros((100, 140), dtype=np.uint8)
    mask[10:90, 70:135] = 255

    with pytest.raises(ValueError, match="foreground"):
        cleanup_mask(mask, point=(20 / 139, 45 / 99), search_radius=8)


def test_refine_mask_fills_only_tiny_holes_and_preserves_real_object_opening() -> None:
    mask = np.zeros((100, 100), dtype=np.uint8)
    mask[10:90, 10:90] = 255
    mask[20:22, 20:22] = 0
    mask[40:65, 40:65] = 0

    refined = refine_mask(mask)

    assert refined.dtype == np.uint8
    assert refined.shape == mask.shape
    assert np.all(refined[20:22, 20:22] == 255)
    assert np.all(refined[45:60, 45:60] == 0)
    assert np.all(refined[:5, :] == 0)


def test_refine_mask_preserves_a_thin_connected_rod() -> None:
    mask = np.zeros((100, 100), np.uint8)
    mask[20:80, 20:80] = 255
    mask[49, 80:96] = 255
    refined = refine_mask(mask)
    assert np.all(refined[49, 80:96] == 255)
