from collections import Counter

import numpy as np
import pytest

from app.perler import generate_perler


MARD_RED_BGR = (34, 0, 211)  # F15: RGB #D30022; backend accepts BGRA.


def assert_counts_match_grid(result: dict) -> None:
    occupied = [cell for cell in result["cells"] if not cell["empty"]]
    assert result["totalBeads"] == len(occupied)
    assert sum(color["count"] for color in result["colors"]) == len(occupied)
    palette_counts: Counter = Counter()
    for color in result["colors"]:
        palette_counts[color["hex"]] += color["count"]
    assert palette_counts == Counter(cell["color"] for cell in occupied)


@pytest.mark.parametrize(("palette", "palette_size"), [("mard221", 221), ("mard291", 291)])
@pytest.mark.parametrize("style", ["cartoon", "realistic"])
def test_mard_exact_red_maps_to_real_code_and_preserves_cell_contract(
    palette: str, palette_size: int, style: str,
) -> None:
    image = np.zeros((28, 28, 4), dtype=np.uint8)
    image[:, :, :3] = MARD_RED_BGR
    image[:, :, 3] = 255

    result = generate_perler(image, size=32, palette=palette, style=style, max_colors=16)

    assert result["paletteId"] == palette
    assert result["paletteSize"] == palette_size
    assert result["size"] == 32
    assert len(result["cells"]) == 32 * 32
    assert result["totalBeads"] == 28 * 28
    assert len(result["colors"]) == 1
    assert result["colors"][0]["id"] == "F15"
    assert result["colors"][0]["hex"] == "#D30022"
    assert result["colors"][0]["count"] == 28 * 28
    for y in range(32):
        for x in range(32):
            cell = result["cells"][y * 32 + x]
            assert set(cell) == {"key", "color", "empty"}
            assert cell["key"] == f"{x}-{y}"
            assert cell["empty"] is not (2 <= x < 30 and 2 <= y < 30)
            if not cell["empty"]:
                assert cell["color"] == "#D30022"
    assert_counts_match_grid(result)


@pytest.mark.parametrize("style", ["cartoon", "realistic"])
@pytest.mark.parametrize("max_colors", [2, 4, 16])
def test_palette_reduction_obeys_requested_color_limit(style: str, max_colors: int) -> None:
    y, x = np.indices((56, 56))
    image = np.zeros((56, 56, 4), dtype=np.uint8)
    image[:, :, 0] = (x * 5 + y * 3) % 256
    image[:, :, 1] = (x * 2 + y * 7) % 256
    image[:, :, 2] = (x * 11 + y) % 256
    image[:, :, 3] = 255

    result = generate_perler(image, size=32, palette="mard291", style=style, max_colors=max_colors)

    assert 1 <= len(result["colors"]) <= max_colors
    assert len({cell["color"] for cell in result["cells"] if not cell["empty"]}) <= max_colors
    assert_counts_match_grid(result)


def test_cartoon_uses_dominant_cell_color_instead_of_averaging_red_and_blue() -> None:
    # Each exact 4x4 sampling block is 75% F15 red and 25% blue. Averaging
    # produces an invented purple/red shade; a region-majority sampler must
    # retain the real red that dominates every cell.
    y, _ = np.indices((112, 112))
    image = np.zeros((112, 112, 4), dtype=np.uint8)
    image[:, :, :3] = MARD_RED_BGR
    image[y % 4 == 3, :3] = (240, 40, 10)
    image[:, :, 3] = 255

    result = generate_perler(image, size=32, palette="mard291", style="cartoon", max_colors=16)

    occupied = [cell for cell in result["cells"] if not cell["empty"]]
    assert len(occupied) == 28 * 28
    assert sum(cell["color"] == "#D30022" for cell in occupied) >= len(occupied) * 0.95
    assert_counts_match_grid(result)


@pytest.mark.parametrize("style", ["cartoon", "realistic"])
def test_new_styles_preserve_tall_shape_transparent_hole_and_row_major_coordinates(style: str) -> None:
    image = np.zeros((28, 14, 4), dtype=np.uint8)
    image[:, :, :3] = MARD_RED_BGR
    image[:, :, 3] = 255
    image[10:18, 4:10, 3] = 0
    # Invisible RGB is deliberately unrelated: it must not fill the hole or
    # pollute neighbouring colours when sampling a transparent cutout.
    image[10:18, 4:10, :3] = (0, 255, 0)

    result = generate_perler(image, size=32, palette="mard221", style=style, max_colors=16)

    for y in range(32):
        for x in range(32):
            cell = result["cells"][y * 32 + x]
            inside_shape = 9 <= x < 23 and 2 <= y < 30
            inside_hole = 13 <= x < 19 and 12 <= y < 20
            assert cell["key"] == f"{x}-{y}"
            assert cell["empty"] is not (inside_shape and not inside_hole)
            if not cell["empty"]:
                assert cell["color"] == "#D30022"
    assert result["totalBeads"] == 28 * 14 - 8 * 6
    assert_counts_match_grid(result)


@pytest.mark.parametrize("options", [
    {"palette": "unknown"},
    {"style": "unknown"},
    {"max_colors": 1},
    {"max_colors": 65},
])
def test_quality_options_reject_unsupported_values(options: dict) -> None:
    image = np.full((8, 8, 4), 255, dtype=np.uint8)

    with pytest.raises(ValueError):
        generate_perler(image, size=32, **options)
