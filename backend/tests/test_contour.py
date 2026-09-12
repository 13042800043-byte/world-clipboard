import numpy as np
import pytest

from app.contour import contour_preview


def test_silhouette_removes_rgb_but_preserves_alpha_holes_and_photo_coordinates():
    mask = np.zeros((100, 160), np.uint8)
    mask[20:80, 40:120] = 255
    mask[40:60, 60:80] = 0
    cutout = np.full((60, 80, 4), (15, 120, 240, 255), np.uint8)
    cutout[:, :, 3] = mask[20:80, 40:120]
    original = cutout.copy()

    silhouette, polygon = contour_preview(cutout, mask)

    assert np.array_equal(cutout, original)
    assert np.array_equal(silhouette[:, :, 3], original[:, :, 3])
    assert np.all(silhouette[:, :, :3] == 17)
    assert silhouette[25, 25, 3] == 0
    assert len(polygon) == 4
    assert min(p[0] for p in polygon) == pytest.approx(40 / 159)
    assert max(p[1] for p in polygon) == pytest.approx(79 / 99)


def test_empty_mask_does_not_produce_a_fake_contour():
    with pytest.raises(ValueError, match='empty contour'):
        contour_preview(np.zeros((10, 10, 4), np.uint8), np.zeros((10, 10), np.uint8))
