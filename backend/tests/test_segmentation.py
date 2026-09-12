import cv2
import numpy as np

from app.segmentation import resize_for_segmentation, segment_foreground


def test_segment_foreground_returns_alpha_cutout_and_normalized_bbox() -> None:
    image = np.zeros((100, 100, 3), dtype=np.uint8)
    image[:] = (40, 170, 40)
    cv2.rectangle(image, (30, 25), (69, 74), (30, 30, 220), thickness=-1)

    result = segment_foreground(image, point=(0.5, 0.5))

    assert result.cutout.shape == (50, 40, 4)
    assert result.mask.shape == (100, 100)
    assert result.bbox == {
        "x": 0.3,
        "y": 0.25,
        "width": 0.4,
        "height": 0.5,
    }
    assert result.cutout[25, 20, 3] == 255


def test_segment_foreground_rejects_points_outside_the_image() -> None:
    image = np.zeros((20, 20, 3), dtype=np.uint8)

    try:
        segment_foreground(image, point=(1.1, 0.5))
    except ValueError as error:
        assert str(error) == "point must be normalized between 0 and 1"
    else:
        raise AssertionError("expected invalid point to be rejected")


def test_resize_for_segmentation_caps_long_edge_and_preserves_ratio() -> None:
    landscape = np.zeros((600, 1200, 3), dtype=np.uint8)
    portrait = np.zeros((1200, 600, 3), dtype=np.uint8)

    resized_landscape = resize_for_segmentation(landscape, max_side=512)
    resized_portrait = resize_for_segmentation(portrait, max_side=512)

    assert resized_landscape.shape == (256, 512, 3)
    assert resized_portrait.shape == (512, 256, 3)


def test_resize_for_segmentation_keeps_small_images_unchanged() -> None:
    image = np.zeros((120, 160, 3), dtype=np.uint8)

    resized = resize_for_segmentation(image, max_side=512)

    assert resized is image
