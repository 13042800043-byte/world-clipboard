from io import BytesIO

import numpy as np
from PIL import Image

from app.perler import generate_perler
from app.perler_preview import render_perler_preview


def test_bead_and_chart_previews_are_pngs_with_square_coordinates() -> None:
    source = np.zeros((28, 28, 4), dtype=np.uint8)
    source[2:26, 8:20] = (34, 0, 211, 255)
    result = generate_perler(source, palette="mard221", style="cartoon")
    for chart in (False, True):
        png = render_perler_preview(result, chart=chart)
        preview = Image.open(BytesIO(png))
        assert preview.format == "PNG"
        assert preview.width == preview.height
        assert preview.width >= 32 * 24
        assert len(png) < 1_000_000
    assert render_perler_preview(result, chart=True) != render_perler_preview(result)


def test_pattern_preview_is_solid_color_not_a_washed_out_ring_cloud() -> None:
    source = np.full((28, 28, 4), (151, 164, 180, 255), dtype=np.uint8)
    result = generate_perler(source, palette="mard221")
    preview = Image.open(BytesIO(render_perler_preview(result)))
    cell = result["cells"][16 * 32 + 16]
    expected = tuple(int(cell["color"][i:i + 2], 16) for i in (1, 3, 5))
    left = top = 28 + 16 * 24
    pixels = np.asarray(preview)[top:top + 24, left:left + 24]
    assert np.mean(np.all(pixels == expected, axis=2)) >= 0.85
    assert preview.getpixel((left + 12, top + 12)) == expected


def test_empty_pattern_cells_are_blank_not_competing_peg_dots() -> None:
    source = np.full((28, 28, 4), 255, dtype=np.uint8)
    result = generate_perler(source)
    preview = np.asarray(Image.open(BytesIO(render_perler_preview(result))))
    assert len(np.unique(preview[28:52, 28:52].reshape(-1, 3), axis=0)) == 1
