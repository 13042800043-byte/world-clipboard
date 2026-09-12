import cv2
import numpy as np

from app.perler import generate_perler


def test_generate_perler_uses_alpha_shape_and_preserves_aspect_ratio() -> None:
    image = np.zeros((20, 40, 4), dtype=np.uint8)
    image[5:15, 5:35, :3] = (40, 40, 220)
    image[5:15, 5:35, 3] = 255

    result = generate_perler(image, size=8)

    assert result["size"] == 8
    assert len(result["cells"]) == 64
    occupied = [cell for cell in result["cells"] if not cell["empty"]]
    assert len(occupied) == 24
    assert result["totalBeads"] == 24
    assert sum(color["count"] for color in result["colors"]) == 24
    assert result["colors"][0]["name"] == "正红"


def test_generate_perler_keeps_transparent_pixels_empty() -> None:
    image = np.zeros((8, 8, 4), dtype=np.uint8)
    cv2.circle(image, (4, 4), 2, (220, 170, 40, 255), thickness=-1)

    result = generate_perler(image, size=8)

    assert result["totalBeads"] < 64
    assert result["totalBeads"] > 0
    assert result["cells"][0]["empty"] is True


def test_generate_perler_rejects_images_without_visible_pixels() -> None:
    image = np.zeros((8, 8, 4), dtype=np.uint8)

    try:
        generate_perler(image, size=8)
    except ValueError as error:
        assert str(error) == "image has no visible foreground"
    else:
        raise AssertionError("expected empty alpha input to be rejected")
