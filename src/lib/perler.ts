export type PerlerColor = {
  id: string;
  name: string;
  hex: string;
};

export type PerlerPattern = {
  size: number;
  cells: Array<PerlerColor | null>;
  counts: Record<string, number>;
  totalBeads: number;
};

type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

type Rgb = { r: number; g: number; b: number };

export const DEMO_PALETTE: PerlerColor[] = [
  { id: 'W01', name: 'Chalk', hex: '#f4f1e8' },
  { id: 'K01', name: 'Ink', hex: '#202322' },
  { id: 'R01', name: 'Tomato', hex: '#e84b3c' },
  { id: 'R02', name: 'Rose', hex: '#ee7a8b' },
  { id: 'O01', name: 'Tangerine', hex: '#ef8b3e' },
  { id: 'Y01', name: 'Lemon', hex: '#f1ca45' },
  { id: 'G01', name: 'Leaf', hex: '#4c9c63' },
  { id: 'G02', name: 'Mint', hex: '#8bc9a6' },
  { id: 'B01', name: 'Sky', hex: '#62a9d6' },
  { id: 'B02', name: 'Ocean', hex: '#356b9a' },
  { id: 'P01', name: 'Grape', hex: '#7b5aa6' },
  { id: 'P02', name: 'Lilac', hex: '#b59acb' },
  { id: 'N01', name: 'Sand', hex: '#d8b27c' },
  { id: 'N02', name: 'Cocoa', hex: '#855d45' },
  { id: 'S01', name: 'Silver', hex: '#a8ada9' },
  { id: 'S02', name: 'Slate', hex: '#59615e' },
];

export function createPerlerPattern(
  source: ImagePixels,
  size: number,
  palette: PerlerColor[] = DEMO_PALETTE,
): PerlerPattern {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error('Grid size must be a positive integer.');
  }
  if (palette.length === 0) {
    throw new Error('A palette is required.');
  }

  const parsedPalette = palette.map((color) => ({
    color,
    rgb: parseHex(color.hex),
  }));
  const cells: Array<PerlerColor | null> = [];
  const counts: Record<string, number> = {};

  for (let gridY = 0; gridY < size; gridY += 1) {
    for (let gridX = 0; gridX < size; gridX += 1) {
      const average = sampleCell(source, gridX, gridY, size);
      if (!average) {
        cells.push(null);
        continue;
      }

      const match = parsedPalette.reduce((best, candidate) => {
        const distance = colorDistance(average, candidate.rgb);
        return distance < best.distance ? { color: candidate.color, distance } : best;
      }, { color: parsedPalette[0].color, distance: Number.POSITIVE_INFINITY });

      cells.push(match.color);
      counts[match.color.id] = (counts[match.color.id] ?? 0) + 1;
    }
  }

  return {
    size,
    cells,
    counts,
    totalBeads: cells.filter(Boolean).length,
  };
}

function sampleCell(
  source: ImagePixels,
  gridX: number,
  gridY: number,
  gridSize: number,
): Rgb | null {
  const startX = Math.floor((gridX * source.width) / gridSize);
  const endX = Math.min(
    source.width,
    Math.max(startX + 1, Math.floor(((gridX + 1) * source.width) / gridSize)),
  );
  const startY = Math.floor((gridY * source.height) / gridSize);
  const endY = Math.min(
    source.height,
    Math.max(startY + 1, Math.floor(((gridY + 1) * source.height) / gridSize)),
  );

  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * source.width + x) * 4;
      const alpha = source.data[offset + 3] / 255;
      if (alpha <= 0.08) continue;

      red += source.data[offset] * alpha;
      green += source.data[offset + 1] * alpha;
      blue += source.data[offset + 2] * alpha;
      weight += alpha;
    }
  }

  if (weight === 0) return null;
  return { r: red / weight, g: green / weight, b: blue / weight };
}

function parseHex(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid palette color: ${hex}`);
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function colorDistance(left: Rgb, right: Rgb): number {
  return (
    (left.r - right.r) ** 2 +
    (left.g - right.g) ** 2 +
    (left.b - right.b) ** 2
  );
}

