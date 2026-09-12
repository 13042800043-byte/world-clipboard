from typing import TypedDict

import cv2
import numpy as np


class PaletteColor(TypedDict):
    id: str
    name: str
    hex: str
    rgb: tuple[int, int, int]


PALETTE: list[PaletteColor] = [
    {"id": "W01", "name": "奶油白", "hex": "#F2EFE8", "rgb": (242, 239, 232)},
    {"id": "K01", "name": "墨黑", "hex": "#26292B", "rgb": (38, 41, 43)},
    {"id": "S01", "name": "浅灰", "hex": "#A9AEB1", "rgb": (169, 174, 177)},
    {"id": "S02", "name": "深灰", "hex": "#61676B", "rgb": (97, 103, 107)},
    {"id": "R01", "name": "正红", "hex": "#D9363E", "rgb": (217, 54, 62)},
    {"id": "O01", "name": "橙色", "hex": "#E67E35", "rgb": (230, 126, 53)},
    {"id": "Y01", "name": "明黄", "hex": "#E3B341", "rgb": (227, 179, 65)},
    {"id": "G01", "name": "草绿", "hex": "#4F9B62", "rgb": (79, 155, 98)},
    {"id": "B01", "name": "湖蓝", "hex": "#4387C5", "rgb": (67, 135, 197)},
    {"id": "C01", "name": "青色", "hex": "#54B6B2", "rgb": (84, 182, 178)},
    {"id": "P01", "name": "樱花粉", "hex": "#E9A5A0", "rgb": (233, 165, 160)},
    {"id": "V01", "name": "紫色", "hex": "#8569A8", "rgb": (133, 105, 168)},
    {"id": "N01", "name": "棕色", "hex": "#8D6147", "rgb": (141, 97, 71)},
]

EMPTY_COLOR = "#EEF0F2"
ALPHA_THRESHOLD = 0.18


def generate_perler(image: np.ndarray, size: int = 32) -> dict[str, object]:
    """Fit a transparent cutout into a square bead grid and quantize its colors."""
    if image.ndim != 3 or image.shape[2] != 4:
        raise ValueError("perler input must be a BGRA image")
    if size < 8 or size > 64:
        raise ValueError("grid size must be between 8 and 64")

    alpha = image[:, :, 3]
    visible_y, visible_x = np.where(alpha > 16)
    if visible_x.size == 0 or visible_y.size == 0:
        raise ValueError("image has no visible foreground")

    left, right = int(visible_x.min()), int(visible_x.max()) + 1
    top, bottom = int(visible_y.min()), int(visible_y.max()) + 1
    crop = image[top:bottom, left:right]
    crop_height, crop_width = crop.shape[:2]
    scale = min(size / crop_width, size / crop_height)
    target_width = max(1, min(size, round(crop_width * scale)))
    target_height = max(1, min(size, round(crop_height * scale)))

    source_alpha = crop[:, :, 3].astype(np.float32) / 255.0
    premultiplied_bgr = crop[:, :, :3].astype(np.float32) * source_alpha[:, :, None]
    interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
    resized_alpha = cv2.resize(source_alpha, (target_width, target_height), interpolation=interpolation)
    resized_premultiplied = cv2.resize(
        premultiplied_bgr,
        (target_width, target_height),
        interpolation=interpolation,
    )

    palette_rgb = np.asarray([color["rgb"] for color in PALETTE], dtype=np.float32)
    cells = [
        {"key": f"{x}-{y}", "color": EMPTY_COLOR, "empty": True}
        for y in range(size)
        for x in range(size)
    ]
    counts: dict[str, int] = {}
    offset_x = (size - target_width) // 2
    offset_y = (size - target_height) // 2

    for y in range(target_height):
        for x in range(target_width):
            coverage = float(resized_alpha[y, x])
            if coverage < ALPHA_THRESHOLD:
                continue
            bgr = resized_premultiplied[y, x] / max(coverage, 1e-6)
            rgb = bgr[::-1]
            palette_index = int(np.argmin(np.sum((palette_rgb - rgb) ** 2, axis=1)))
            palette_color = PALETTE[palette_index]
            grid_x, grid_y = x + offset_x, y + offset_y
            cells[grid_y * size + grid_x] = {
                "key": f"{grid_x}-{grid_y}",
                "color": palette_color["hex"],
                "empty": False,
            }
            color_id = palette_color["id"]
            counts[color_id] = counts.get(color_id, 0) + 1

    colors = [
        {"id": color["id"], "name": color["name"], "hex": color["hex"], "count": counts[color["id"]]}
        for color in PALETTE
        if color["id"] in counts
    ]
    colors.sort(key=lambda color: color["count"], reverse=True)
    total_beads = sum(color["count"] for color in colors)
    return {"size": size, "cells": cells, "colors": colors, "totalBeads": total_beads}
