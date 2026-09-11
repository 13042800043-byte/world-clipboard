import { describe, expect, it } from 'vitest';
import { createPerlerPattern, type PerlerColor } from './perler';

const palette: PerlerColor[] = [
  { id: 'R', name: 'Red', hex: '#ef4444' },
  { id: 'B', name: 'Blue', hex: '#3b82f6' },
];

function imageData(
  width: number,
  height: number,
  pixels: number[],
): Pick<ImageData, 'data' | 'width' | 'height'> {
  return { width, height, data: new Uint8ClampedArray(pixels) };
}

describe('createPerlerPattern', () => {
  it('maps each cell to the nearest palette color and counts usage', () => {
    const source = imageData(2, 2, [
      240, 40, 50, 255,
      40, 100, 240, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);

    const result = createPerlerPattern(source, 2, palette);

    expect(result.cells.map((cell) => (cell ? cell.id : null))).toEqual([
      'R',
      'B',
      null,
      null,
    ]);
    expect(result.counts).toEqual({ R: 1, B: 1 });
  });

  it('treats fully transparent source pixels as empty beads', () => {
    const source = imageData(1, 1, [255, 0, 0, 0]);

    const result = createPerlerPattern(source, 1, palette);

    expect(result.cells).toEqual([null]);
    expect(result.counts).toEqual({});
    expect(result.totalBeads).toBe(0);
  });

  it('averages source pixels inside a grid cell before color matching', () => {
    const source = imageData(2, 2, [
      255, 0, 0, 255,
      255, 0, 0, 255,
      40, 90, 230, 255,
      255, 0, 0, 255,
    ]);

    const result = createPerlerPattern(source, 1, palette);

    expect(result.cells[0]?.id).toBe('R');
    expect(result.totalBeads).toBe(1);
  });
});
