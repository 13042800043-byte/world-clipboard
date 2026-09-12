from io import BytesIO
import base64

import cv2
import numpy as np
from PIL import Image, ImageDraw

from app.perler import generate_perler
from app.perler_preview import render_perler_preview


def png_url(image: Image.Image) -> str:
    stream = BytesIO()
    image.save(stream, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(stream.getvalue()).decode('ascii')


def checkerboard(image: Image.Image) -> Image.Image:
    background = Image.new('RGBA', image.size, '#FFFFFF')
    draw = ImageDraw.Draw(background)
    for y in range(0, image.height, 16):
        for x in range(0, image.width, 16):
            if (x // 16 + y // 16) % 2:
                draw.rectangle((x, y, x + 15, y + 15), fill='#EEF0F2')
    return Image.alpha_composite(background, image).convert('RGB')


def source_rgba(image: np.ndarray) -> Image.Image:
    if image.ndim != 3 or image.shape[2] != 4 or image.dtype != np.uint8:
        raise ValueError('template input must be 8-bit BGRA')
    source = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGRA2RGBA))
    bbox = source.getchannel('A').point(lambda value: 255 if value > 16 else 0).getbbox()
    if not bbox:
        raise ValueError('image has no visible foreground')
    return source.crop(bbox)


def make_grid(image: np.ndarray, size: int, max_colors: int, prefix: str = '') -> dict:
    source_rgba(image)
    grid = generate_perler(image, size, palette='legacy' if prefix else 'mard221',
                           style='realistic', max_colors=max_colors)
    if prefix:
        for index, color in enumerate(grid['colors']):
            color['id'] = f'{prefix}{index + 1:02}'
    return grid


def grid_rgba(grid: dict) -> Image.Image:
    image = Image.new('RGBA', (grid['size'], grid['size']))
    pixels = image.load()
    for index, cell in enumerate(grid['cells']):
        if not cell['empty']:
            rgb = tuple(int(cell['color'][i:i + 2], 16) for i in (1, 3, 5))
            pixels[index % grid['size'], index // grid['size']] = (*rgb, 255)
    return image


def grid_result(kind: str, title: str, grid: dict, unit: str, palette_label: str) -> dict:
    pattern = grid_rgba(grid).resize((grid['size'] * 16,) * 2, Image.Resampling.NEAREST)
    return {'kind': kind, 'title': title, 'grid': grid,
            'previewImage': png_url(checkerboard(pattern)),
            'chartImage': 'data:image/png;base64,' + base64.b64encode(render_perler_preview(grid, chart=True)).decode('ascii'),
            'exportImage': png_url(pattern), 'previewLabel': '图案预览', 'chartLabel': '色号图纸',
            'exportLabel': '透明 PNG', 'paletteLabel': palette_label,
            'metrics': [{'label': '网格', 'value': f"{grid['size']} × {grid['size']}"},
                        {'label': '颜色', 'value': str(len(grid['colors']))},
                        {'label': unit + '数', 'value': str(grid['totalBeads'])}],
            'materials': [{**color, 'unit': unit} for color in grid['colors']], 'notes': []}
