export type CaptureMode = 'object' | 'color' | 'contour';

export type ImagePixels = Pick<ImageData, 'data' | 'width' | 'height'>;

export function applyCaptureMode(source: ImagePixels, mode: CaptureMode): ImagePixels {
  if (mode === 'object') {
    return { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
  }

  const output = new Uint8ClampedArray(source.data.length);
  const average = mode === 'color' ? averageVisibleColor(source) : undefined;

  for (let offset = 0; offset < source.data.length; offset += 4) {
    const alpha = source.data[offset + 3];
    if (alpha === 0) continue;

    if (mode === 'color' && average) {
      output.set([average.r, average.g, average.b, alpha], offset);
    } else {
      output.set([27, 29, 28, alpha], offset);
    }
  }

  return { width: source.width, height: source.height, data: output };
}

export function pixelsToDataUrl(source: ImagePixels): string {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable.');

  context.putImageData(
    new ImageData(new Uint8ClampedArray(source.data), source.width, source.height),
    0,
    0,
  );
  return canvas.toDataURL('image/png');
}

function averageVisibleColor(source: ImagePixels): { r: number; g: number; b: number } | undefined {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weight = 0;

  for (let offset = 0; offset < source.data.length; offset += 4) {
    const alpha = source.data[offset + 3] / 255;
    if (alpha <= 0.08) continue;
    red += source.data[offset] * alpha;
    green += source.data[offset + 1] * alpha;
    blue += source.data[offset + 2] * alpha;
    weight += alpha;
  }

  if (weight === 0) return undefined;
  return {
    r: Math.round(red / weight),
    g: Math.round(green / weight),
    b: Math.round(blue / weight),
  };
}
