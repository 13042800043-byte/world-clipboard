import type { PerlerCell, PerlerResult } from './perler-types';

const PALETTE = [
  { id: 'W01', name: '奶油白', hex: '#F2EFE8' },
  { id: 'K01', name: '墨黑', hex: '#26292B' },
  { id: 'S01', name: '浅灰', hex: '#A9AEB1' },
  { id: 'S02', name: '深灰', hex: '#61676B' },
  { id: 'P01', name: '樱花粉', hex: '#E9A5A0' },
  { id: 'Y01', name: '铃铛黄', hex: '#DDAE45' },
] as const;

export function generateMockPerler(type: 'object' | 'color' | 'contour'): PerlerResult {
  const size = 32;
  const cells: PerlerCell[] = [];
  const counts: Record<string, number> = {};

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const paletteIndex = colorAt(x, y, type);
      const paletteColor = paletteIndex === null ? null : PALETTE[paletteIndex];
      cells.push({
        key: `${x}-${y}`,
        color: paletteColor?.hex ?? '#E6E9EC',
        empty: paletteColor === null,
      });
      if (paletteColor) counts[paletteColor.id] = (counts[paletteColor.id] ?? 0) + 1;
    }
  }

  const colors = PALETTE
    .filter((color) => counts[color.id])
    .map((color) => ({ ...color, count: counts[color.id] }))
    .sort((left, right) => right.count - left.count);

  return {
    size,
    cells,
    colors,
    totalBeads: colors.reduce((total, color) => total + color.count, 0),
  };
}

function colorAt(x: number, y: number, type: 'object' | 'color' | 'contour'): number | null {
  const head = ((x - 15.5) / 9.4) ** 2 + ((y - 10.5) / 8.2) ** 2 <= 1;
  const leftEar = y >= 2 && y <= 8 && x >= 7 && x <= 14 && x + y >= 13;
  const rightEar = y >= 2 && y <= 8 && x >= 18 && x <= 25 && x - y <= 19;
  const body = ((x - 15.5) / 7.3) ** 2 + ((y - 22) / 9.5) ** 2 <= 1;
  const paw = y >= 26 && y <= 30 && ((x >= 7 && x <= 12) || (x >= 19 && x <= 24));
  const inside = head || leftEar || rightEar || body || paw;
  if (!inside) return null;

  if (type === 'color') return 2;
  if (type === 'contour') {
    const edge = !isInside(x - 1, y) || !isInside(x + 1, y) || !isInside(x, y - 1) || !isInside(x, y + 1);
    return edge ? 1 : null;
  }

  if (y <= 8 && (x <= 13 || x >= 19)) return 3;
  if (y >= 7 && y <= 14 && (x <= 13 || x >= 19)) return 3;
  if (y >= 10 && y <= 12 && (x === 12 || x === 19)) return 1;
  if (y === 14 && x >= 14 && x <= 17) return 4;
  if (y >= 17 && y <= 19 && x >= 14 && x <= 17) return 5;
  return 0;
}

function isInside(x: number, y: number): boolean {
  const head = ((x - 15.5) / 9.4) ** 2 + ((y - 10.5) / 8.2) ** 2 <= 1;
  const body = ((x - 15.5) / 7.3) ** 2 + ((y - 22) / 9.5) ** 2 <= 1;
  const leftEar = y >= 2 && y <= 8 && x >= 7 && x <= 14 && x + y >= 13;
  const rightEar = y >= 2 && y <= 8 && x >= 18 && x <= 25 && x - y <= 19;
  const paw = y >= 26 && y <= 30 && ((x >= 7 && x <= 12) || (x >= 19 && x <= 24));
  return head || body || leftEar || rightEar || paw;
}
