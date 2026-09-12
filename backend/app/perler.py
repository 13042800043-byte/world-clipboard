import json
from pathlib import Path
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

# MARD data adapted from Jett-Wu/Perler_Beads_Generator (MIT, copyright 2026 Jett-Wu).
# Source: https://github.com/Jett-Wu/Perler_Beads_Generator/blob/main/src/palette.ts
_mard = json.loads(Path(__file__).with_name("mard-palette.json").read_text(encoding="utf-8"))


def _make_palette(rows: list[dict[str, str]]) -> list[PaletteColor]:
    return [{"id": row["id"], "name": f'MARD {row["id"]}', "hex": row["hex"],
             "rgb": tuple(int(row["hex"][i:i + 2], 16) for i in (1, 3, 5))} for row in rows]


PALETTES = {"legacy": PALETTE, "mard221": _make_palette(_mard["basic"]),
            "mard291": _make_palette(_mard["basic"] + _mard["extended"])}


def _distances(rgb: np.ndarray, colors: np.ndarray) -> np.ndarray:
    """Red-mean perceptual weighting, ported from upstream palette.colorDistance."""
    difference = rgb[:, None, :] - colors[None, :, :]
    red_mean = (rgb[:, None, 0] + colors[None, :, 0]) / 2
    return np.sqrt((2 + red_mean / 256) * difference[:, :, 0] ** 2
                   + 4 * difference[:, :, 1] ** 2
                   + (2 + (255 - red_mean) / 256) * difference[:, :, 2] ** 2)


def _nearest(rgb: np.ndarray, colors: np.ndarray) -> np.ndarray:
    # Bound distance-matrix working memory for both 49/81-sample cell modes.
    return np.concatenate([np.argmin(_distances(rgb[i:i + 4096], colors), axis=1)
                           for i in range(0, len(rgb), 4096)])


def _candidates(counts: np.ndarray, colors: np.ndarray, limit: int) -> np.ndarray:
    available = np.flatnonzero(counts)
    selected = [int(np.argmax(counts))]
    chroma = np.ptp(colors, axis=1)
    luminance = colors @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    # Adapt upstream feature slots/diversity ranking: preserve dark lines and
    # saturated accents instead of spending every slot on similar shadows.
    while len(selected) < min(limit, len(available)):
        distance = _distances(colors, colors[selected]).min(axis=1)
        feature = np.where((chroma > 58) | (luminance < 48), 2.15, 1.0)
        score = np.sqrt(counts) * np.clip(distance / 26, 0.35, 5.4) ** 1.55 * feature
        score[counts == 0] = -1
        score[selected] = -1
        selected.append(int(np.argmax(score)))
    return np.asarray(selected)


def _cleanup(grid: np.ndarray, colors: np.ndarray) -> np.ndarray:
    """One conservative speckle pass; never fill alpha holes or erase accents."""
    cleaned = grid.copy()
    height, width = grid.shape
    for y in range(height):
        for x in range(width):
            current = grid[y, x]
            if current < 0:
                continue
            neighbors = grid[max(0, y - 1):y + 2, max(0, x - 1):x + 2].ravel()
            if np.count_nonzero(neighbors == current) > 1:
                continue
            occupied = neighbors[neighbors >= 0]
            ids, counts = np.unique(occupied, return_counts=True)
            replacement = ids[np.argmax(counts)]
            if counts.max() >= 5 and _distances(colors[current:current + 1], colors[replacement:replacement + 1])[0, 0] < 26:
                cleaned[y, x] = replacement
    return cleaned


def _preserve_dark_strokes(primary: np.ndarray, rgb: np.ndarray, weights: np.ndarray,
                           mapped: np.ndarray, colors: np.ndarray, visible: np.ndarray,
                           height: int, width: int) -> np.ndarray:
    """Retain sampled, coherent minority ink; do not invent/dilate an outline."""
    luma_weights = np.array([0.299, 0.587, 0.114], dtype=np.float32)
    luminance = rgb @ luma_weights
    # Only high-coverage interior cells: invisible RGB cannot become an ink line.
    median = np.median(np.where(weights > 0, luminance, 255), axis=1)
    ink = (luminance < 150) & (luminance < median[:, None] - 30) & (weights > 0)
    ink_weights = weights * ink
    fraction = ink_weights.sum(axis=1) / np.maximum(weights.sum(axis=1), 1e-6)
    votes = np.zeros((len(primary), len(colors)), dtype=np.float32)
    np.add.at(votes, (np.arange(len(primary))[:, None], mapped), ink_weights)
    ink_match = np.argmax(votes, axis=1)
    candidate_luma = colors[ink_match] @ luma_weights
    eligible = visible & (weights.mean(axis=1) >= 0.7) & (fraction >= 0.10) & (fraction <= 0.45)
    eligible &= (candidate_luma < 160) & (candidate_luma < median - 25)
    field = eligible.reshape(height, width).astype(np.float32)
    neighbors = cv2.filter2D(field, -1, np.ones((3, 3), dtype=np.float32), borderType=cv2.BORDER_CONSTANT)
    # Gating, NOT dilation: isolated samples disappear; a supported stroke stays
    # inside its own sampled cell and uses an existing selected palette color.
    supported = eligible & (neighbors.ravel() >= 2)
    return np.where(supported, ink_match, primary)


def generate_perler(image: np.ndarray, size: int = 32, *, palette: str = "legacy",
                    style: str = "realistic", max_colors: int = 16) -> dict[str, object]:
    """Fit a transparent cutout into a square bead grid and quantize its colors."""
    if image.ndim != 3 or image.shape[2] != 4:
        raise ValueError("perler input must be a BGRA image")
    if not isinstance(size, int) or size < 8 or size > 64:
        raise ValueError("grid size must be between 8 and 64")
    if palette not in PALETTES or style not in ("cartoon", "realistic"):
        raise ValueError("invalid perler palette or style")
    if not isinstance(max_colors, int) or max_colors < 2 or max_colors > 64:
        raise ValueError("max colors must be between 2 and 64")

    alpha = image[:, :, 3]
    visible_y, visible_x = np.where(alpha > 16)
    if visible_x.size == 0 or visible_y.size == 0:
        raise ValueError("image has no visible foreground")

    left, right = int(visible_x.min()), int(visible_x.max()) + 1
    top, bottom = int(visible_y.min()), int(visible_y.max()) + 1
    crop = image[top:bottom, left:right]
    crop_height, crop_width = crop.shape[:2]
    padding = max(1, round(size * 0.0625))
    usable_size = size - padding * 2
    scale = min(usable_size / crop_width, usable_size / crop_height)
    target_width = max(1, min(usable_size, round(crop_width * scale)))
    target_height = max(1, min(usable_size, round(crop_height * scale)))

    # Region sampling/voting and style thresholds adapted from upstream
    # imageToBeads.ts. Keep PNG alpha, NOT edge-color background guessing:
    # white objects and enclosed transparent holes must survive.
    # https://github.com/Jett-Wu/Perler_Beads_Generator/blob/main/src/imageToBeads.ts
    side = 7 if style == "cartoon" else 9
    ys = np.minimum(crop_height - 1, ((np.arange(target_height)[:, None] + (np.arange(side) + 0.5) / side) * crop_height / target_height).astype(int))
    xs = np.minimum(crop_width - 1, ((np.arange(target_width)[:, None] + (np.arange(side) + 0.5) / side) * crop_width / target_width).astype(int))
    samples = crop[ys[:, None, :, None], xs[None, :, None, :]].reshape(target_height * target_width, side * side, 4)
    weights = samples[:, :, 3].astype(np.float32) / 255
    weights[samples[:, :, 3] < 24] = 0
    coverage = weights.mean(axis=1)
    visible = coverage >= (0.28 if style == "cartoon" else ALPHA_THRESHOLD)
    if not visible.any():
        raise ValueError("foreground is too small for this grid")
    active_palette = PALETTES[palette]
    palette_rgb = np.asarray([color["rgb"] for color in active_palette], dtype=np.float32)
    rgb = samples[:, :, 2::-1].astype(np.float32)
    # Exact 24-bit deduplication, not coarser quantization: the 81 samples per
    # cell often repeat the same color. Keep inverse indices for alpha voting.
    channels = samples[:, :, :3].astype(np.uint32)
    packed = (channels[:, :, 2] << 16) | (channels[:, :, 1] << 8) | channels[:, :, 0]
    unique, inverse = np.unique(packed.ravel(), return_inverse=True)
    unique_rgb = np.stack(((unique >> 16) & 255, (unique >> 8) & 255, unique & 255), axis=1).astype(np.float32)
    mapped = _nearest(unique_rgb, palette_rgb)[inverse].reshape(len(samples), -1)
    counts = np.bincount(mapped[visible].ravel(), weights=weights[visible].ravel(), minlength=len(active_palette))
    selected = _candidates(counts, palette_rgb, max_colors)
    candidates_rgb = palette_rgb[selected]
    mapped = _nearest(unique_rgb, candidates_rgb)[inverse].reshape(len(samples), -1)
    votes = np.zeros((len(samples), len(selected)), dtype=np.float32)
    np.add.at(votes, (np.arange(len(samples))[:, None], mapped), weights)
    primary = np.argmax(votes, axis=1)
    if style == "realistic":
        average = (rgb * weights[:, :, None]).sum(axis=1) / np.maximum(weights.sum(axis=1, keepdims=True), 1e-6)
        average_match = _nearest(average, candidates_rgb)
        dominance = votes.max(axis=1) / np.maximum(weights.sum(axis=1), 1e-6)
        primary = np.where(dominance >= 0.26, primary, average_match)
        primary = _preserve_dark_strokes(primary, rgb, weights, mapped, candidates_rgb,
                                        visible, target_height, target_width)
    grid = np.where(visible, primary, -1).reshape(target_height, target_width)
    if style == "cartoon":
        grid = _cleanup(grid, candidates_rgb)
    cells = [
        {"key": f"{x}-{y}", "color": EMPTY_COLOR, "empty": True}
        for y in range(size)
        for x in range(size)
    ]
    counts: dict[str, int] = {}
    offset_x = padding + (usable_size - target_width) // 2
    offset_y = padding + (usable_size - target_height) // 2

    for y in range(target_height):
        for x in range(target_width):
            candidate = int(grid[y, x])
            if candidate < 0:
                continue
            palette_color = active_palette[int(selected[candidate])]
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
        for color in active_palette
        if color["id"] in counts
    ]
    colors.sort(key=lambda color: color["count"], reverse=True)
    total_beads = sum(color["count"] for color in colors)
    return {"size": size, "cells": cells, "colors": colors, "totalBeads": total_beads,
            "paletteId": palette, "paletteSize": len(active_palette), "style": style,
            "maxColors": max_colors}
