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
    assert len(occupied) == 12
    assert result["totalBeads"] == 12
    assert sum(color["count"] for color in result["colors"]) == 12
    assert result["colors"][0]["name"] == "正红"
    assert all(cell["empty"] for cell in result["cells"][:8])
    assert all(cell["empty"] for cell in result["cells"][-8:])


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


def test_tall_object_has_straight_rows_and_row_major_coordinates() -> None:
    """A tall package must stay upright, not become wrapped diagonal fragments."""
    image = np.zeros((120, 80, 4), dtype=np.uint8)
    image[15:100, 20:60] = (62, 54, 217, 255)
    image[15:30, 20:60] = (65, 179, 227, 255)
    result = generate_perler(image, size=32)
    cells = result["cells"]
    rows = [cells[y * 32:(y + 1) * 32] for y in range(32)]
    occupied_columns = []
    for y, row in enumerate(rows):
        assert len(row) == 32
        assert [cell["key"] for cell in row] == [f"{x}-{y}" for x in range(32)]
        columns = [x for x, cell in enumerate(row) if not cell["empty"]]
        if columns:
            assert columns == list(range(columns[0], columns[-1] + 1))
            occupied_columns.append(columns)
    assert len(occupied_columns) == 28
    assert len(occupied_columns[0]) == 13
    assert all(columns == occupied_columns[0] for columns in occupied_columns)
    assert result["totalBeads"] == 28 * 13
