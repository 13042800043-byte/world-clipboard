import { describe, expect, it } from 'vitest';
import { sampleNeighborhoodColor } from '../../miniprogram/vision/color-picker';

describe('sampleNeighborhoodColor', () => {
  it('trims dark and bright extremes before averaging nearby pixels', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      100, 110, 120, 255,
      110, 120, 130, 255,
      120, 130, 140, 255,
      255, 255, 255, 255,
    ]);

    expect(sampleNeighborhoodColor(pixels, 5, 1, 0.5, 0.5, 2)).toEqual({
      hex: '#6E7882',
      rgb: [110, 120, 130],
    });
  });
});
