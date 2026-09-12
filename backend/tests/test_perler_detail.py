import numpy as np
import pytest

from app.perler import generate_perler


CREAM_BGRA = (226, 239, 246, 255)
DARK_BGRA = (60, 65, 68, 255)


def pale_panel() -> np.ndarray:
    image = np.zeros((240, 240, 4), dtype=np.uint8)
    image[8:232, 8:232] = CREAM_BGRA
    return image


def dark_grid(result: dict) -> np.ndarray:
    size = result["size"]
    dark = np.zeros((size, size), dtype=bool)
    for index, cell in enumerate(result["cells"]):
        if cell["empty"]:
            continue
        rgb = [int(cell["color"][offset:offset + 2], 16) for offset in (1, 3, 5)]
        luminance = sum(channel * weight for channel, weight in zip(rgb, (0.299, 0.587, 0.114)))
        dark[index // size, index % size] = luminance < 140
    return dark


def longest_run(values: np.ndarray) -> int:
    longest = current = 0
    for value in values:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest


@pytest.mark.parametrize("size", [32, 64])
def test_realistic_preserves_continuous_subcell_dark_lines_on_a_pale_object(size: int) -> None:
    image = pale_panel()
    # One-source-pixel strokes are narrower than either the 8px (32-grid)
    # or 4px (64-grid) bead cell. They are coherent long features, not noise.
    # Coordinates are relative to the tight 224px foreground crop.
    image[8 + 32:8 + 192, 8 + 63] = DARK_BGRA
    image[8 + 111, 8 + 32:8 + 192] = DARK_BGRA

    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=16)

    dark = dark_grid(result)
    padding = size // 16
    usable = size - padding * 2
    cell_scale = 224 / usable
    line_x = padding + int(63 / cell_scale)
    line_y = padding + int(111 / cell_scale)
    span_start = padding + int(32 / cell_scale)
    span_stop = padding + int(192 / cell_scale)
    vertical = dark[span_start:span_stop, line_x - 1:line_x + 2].any(axis=1)
    horizontal = dark[line_y - 1:line_y + 2, span_start:span_stop].any(axis=0)
    # Require a recognisable continuous feature, not exact recovery of all
    # subpixel geometry or an arbitrary minimum global black-bead count.
    assert longest_run(vertical) >= int(len(vertical) * 0.6)
    assert longest_run(horizontal) >= int(len(horizontal) * 0.6)
    assert sum(color["count"] for color in result["colors"]) == result["totalBeads"]


@pytest.mark.parametrize("size", [32, 64])
def test_detail_mode_keeps_gray_strokes_not_only_near_black_ink(size: int) -> None:
    image = pale_panel()
    image[8:232, 8:232] = (175, 180, 190, 255)
    image[40:200, 71] = (130, 130, 130, 255)
    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=16)
    grid = dark_grid(result)
    padding = size // 16
    usable = size - 2 * padding
    column = padding + int(63 * usable / 224)
    span = grid[padding + int(32 * usable / 224):padding + int(192 * usable / 224), column - 1:column + 2].any(axis=1)
    assert longest_run(span) >= int(len(span) * 0.6)


@pytest.mark.parametrize("size", [32, 64])
def test_detail_preservation_does_not_fill_transparent_holes_or_change_alpha_shape(size: int) -> None:
    image = pale_panel()
    image[8 + 144:8 + 168, 8 + 136:8 + 160, 3] = 0
    image[8 + 144:8 + 168, 8 + 136:8 + 160, :3] = (0, 0, 0)
    image[8 + 32:8 + 192, 8 + 63] = DARK_BGRA

    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=16)

    padding = size // 16
    usable = size - padding * 2
    scale = usable / 224
    hole_left, hole_right = padding + int(136 * scale), padding + int(160 * scale)
    hole_top, hole_bottom = padding + int(144 * scale), padding + int(168 * scale)
    for y in range(size):
        for x in range(size):
            cell = result["cells"][y * size + x]
            expected_visible = padding <= x < size - padding and padding <= y < size - padding
            inside_hole = hole_left <= x < hole_right and hole_top <= y < hole_bottom
            assert cell["key"] == f"{x}-{y}"
            assert cell["empty"] is not (expected_visible and not inside_hole)


@pytest.mark.parametrize("size", [32, 64])
def test_a_single_black_noise_pixel_does_not_expand_into_a_dark_region(size: int) -> None:
    image = pale_panel()
    image[8 + 111, 8 + 111] = (0, 0, 0, 255)

    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=16)

    # A subpixel noise sample may disappear or occupy one bead, but detail
    # emphasis must not dilate it into a neighbouring 3x3 dark patch.
    assert np.count_nonzero(dark_grid(result)) <= 1


@pytest.mark.parametrize("size", [32, 64])
def test_a_uniform_pale_object_does_not_get_an_invented_dark_outline(size: int) -> None:
    result = generate_perler(pale_panel(), size=size, palette="mard221", style="realistic", max_colors=16)

    assert np.count_nonzero(dark_grid(result)) == 0
    assert len(result["colors"]) == 1
    assert result["totalBeads"] == (size - 2 * (size // 16)) ** 2


@pytest.mark.parametrize("size", [32, 64])
def test_isolated_corner_noise_does_not_get_mirrored_neighbor_support(size: int) -> None:
    image = pale_panel()
    for y, x in [(8, 8), (8, 231), (231, 8), (231, 231)]:
        image[y, x] = (0, 0, 0, 255)

    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=2)

    assert np.count_nonzero(dark_grid(result)) <= 4
    assert len(result["colors"]) <= 2


@pytest.mark.parametrize("size", [32, 64])
def test_hidden_rgb_cannot_create_ink_around_a_transparent_hole(size: int) -> None:
    black_hidden = pale_panel()
    black_hidden[8 + 144:8 + 168, 8 + 136:8 + 160] = (0, 0, 0, 0)
    green_hidden = black_hidden.copy()
    green_hidden[8 + 144:8 + 168, 8 + 136:8 + 160, :3] = (0, 255, 0)

    black_result = generate_perler(black_hidden, size=size, palette="mard221", style="realistic", max_colors=2)
    green_result = generate_perler(green_hidden, size=size, palette="mard221", style="realistic", max_colors=2)

    assert black_result["cells"] == green_result["cells"]
    assert black_result["colors"] == green_result["colors"]
    assert np.count_nonzero(dark_grid(black_result)) == 0


@pytest.mark.parametrize("size", [32, 64])
def test_noise_next_to_a_stroke_does_not_dilate_the_supported_line(size: int) -> None:
    image = pale_panel()
    image[8 + 32:8 + 192, 8 + 63] = DARK_BGRA
    # A single speckle beside the coherent line must not borrow its support
    # and propagate darker colours into neighboring unsampled cells.
    image[8 + 111, 8 + 68] = (0, 0, 0, 255)

    result = generate_perler(image, size=size, palette="mard221", style="realistic", max_colors=2)

    dark = dark_grid(result)
    padding = size // 16
    cell_scale = 224 / (size - padding * 2)
    line_x = padding + int(63 / cell_scale)
    outside_line = dark.copy()
    outside_line[:, line_x] = False
    assert np.count_nonzero(outside_line) <= 1
    assert len(result["colors"]) <= 2
