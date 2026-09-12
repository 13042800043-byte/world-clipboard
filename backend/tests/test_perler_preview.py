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
