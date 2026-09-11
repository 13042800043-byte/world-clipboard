import { describe, expect, it } from 'vitest';
import { applyCaptureMode } from './capture';

const source = {
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([
    120, 130, 140, 255,
    240, 180, 160, 0,
  ]),
};

describe('applyCaptureMode', () => {
  it('keeps object pixels unchanged', () => {
    expect(applyCaptureMode(source, 'object').data).toEqual(source.data);
  });

  it('creates a solid color sample while preserving transparency', () => {
    const result = applyCaptureMode(source, 'color');

    expect(Array.from(result.data)).toEqual([
      120, 130, 140, 255,
      0, 0, 0, 0,
    ]);
  });

  it('creates a dark silhouette from the alpha mask', () => {
    const result = applyCaptureMode(source, 'contour');

    expect(Array.from(result.data)).toEqual([
      27, 29, 28, 255,
      0, 0, 0, 0,
    ]);
  });
});
