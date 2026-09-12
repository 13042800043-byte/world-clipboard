from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from app.paste_plugins.sticker import generate_sticker
from app.paste_plugins.pixel_art import generate_pixel_art
from app.paste_plugins.lego import generate_lego
from app.paste_plugins.cross_stitch import generate_cross_stitch


def cutout():
    image = np.zeros((80, 60, 4), np.uint8)
    image[8:72, 12:48] = (34, 0, 211, 255)
    image[32:48, 24:36] = 0
    return image


def decode(url):
    import base64
    return Image.open(BytesIO(base64.b64decode(url.split(',', 1)[1])))


@pytest.mark.parametrize('border', [0, 8, 16])
def test_sticker_is_rgba_with_real_source_color_and_white_border(border):
    result = generate_sticker(cutout(), border=border)
    image = np.asarray(decode(result['exportImage']))
    assert image.shape[2] == 4
    assert image[0, 0, 3] == 0
    assert np.any(np.all(image == (211, 0, 34, 255), axis=2))
    if border:
        assert np.any(np.all(image == (255, 255, 255, 255), axis=2))
    else:
        assert image[image.shape[0] // 2, image.shape[1] // 2, 3] == 0
    assert decode(result['chartImage']).width < decode(result['chartImage']).height
    assert result['materials'] == []


@pytest.mark.parametrize('size', [32, 48, 64])
def test_pixel_export_is_transparent_and_color_limited(size):
    result = generate_pixel_art(cutout(), size=size, max_colors=8)
    image = decode(result['exportImage'])
    assert image.mode == 'RGBA'
    assert image.width == image.height == size * 16
    pixels = np.asarray(image)
    assert pixels[0, 0, 3] == 0
    assert len(np.unique(pixels[pixels[:, :, 3] > 0, :3], axis=0)) <= 8
    assert sum(c['count'] for c in result['materials']) > 0


@pytest.mark.parametrize('size', [32, 64])
def test_lego_placements_cover_each_same_color_stud_once_without_filling_holes(size):
    result = generate_lego(cutout(), size=size, max_colors=8)
    occupied = np.zeros((size, size), np.uint8)
    for part in result['placements']:
        x, y, w, h = (part[k] for k in ('x', 'y', 'width', 'height'))
        assert 0 <= x < x + w <= size and 0 <= y < y + h <= size
        region = occupied[y:y + h, x:x + w]
        assert not region.any()
        region[:] = 1
        for cy in range(y, y + h):
            for cx in range(x, x + w):
                cell = result['grid']['cells'][cy * size + cx]
                assert not cell['empty'] and cell['color'] == part['color']
    assert occupied.sum() == result['grid']['totalBeads']
    assert sum(c['count'] for c in result['materials']) == len(result['placements'])
    assert len(result['placements']) < occupied.sum()
    assert '非官方' in result['paletteLabel']


def test_cross_stitch_uses_generic_thread_codes_and_correct_14ct_size():
    result = generate_cross_stitch(cutout(), size=32, max_colors=8)
    assert all(c['id'].startswith('T') and c['unit'] == '针' for c in result['materials'])
    assert sum(c['count'] for c in result['materials']) == result['grid']['totalBeads']
    assert any('5.8' in metric['value'] for metric in result['metrics'])
    assert '非官方' in result['paletteLabel']
    assert decode(result['chartImage']).format == 'PNG'


@pytest.mark.parametrize('generator', [generate_sticker, generate_pixel_art, generate_lego, generate_cross_stitch])
def test_plugins_reject_empty_foreground(generator):
    with pytest.raises(ValueError):
        generator(np.zeros((8, 8, 4), np.uint8))
