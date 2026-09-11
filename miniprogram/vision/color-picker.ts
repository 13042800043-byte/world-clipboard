export type SampledColor = {
  hex: string;
  rgb: [number, number, number];
};

type Pixel = { r: number; g: number; b: number; luminance: number };

export function sampleNeighborhoodColor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  normalizedX: number,
  normalizedY: number,
  radius = 2,
): SampledColor {
  const centerX = clamp(Math.round(normalizedX * (width - 1)), 0, width - 1);
  const centerY = clamp(Math.round(normalizedY * (height - 1)), 0, height - 1);
  const samples: Pixel[] = [];

  for (let y = Math.max(0, centerY - radius); y <= Math.min(height - 1, centerY + radius); y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= Math.min(width - 1, centerX + radius); x += 1) {
      const offset = (y * width + x) * 4;
      if (pixels[offset + 3] <= 20) continue;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      samples.push({ r, g, b, luminance: r * 0.2126 + g * 0.7152 + b * 0.0722 });
    }
  }

  if (samples.length === 0) return { hex: '#000000', rgb: [0, 0, 0] };

  samples.sort((left, right) => left.luminance - right.luminance);
  const trim = samples.length >= 5 ? Math.floor(samples.length * 0.2) : 0;
  const kept = samples.slice(trim, samples.length - trim || samples.length);
  const totals = kept.reduce(
    (sum, pixel) => ({ r: sum.r + pixel.r, g: sum.g + pixel.g, b: sum.b + pixel.b }),
    { r: 0, g: 0, b: 0 },
  );
  const rgb: [number, number, number] = [
    Math.round(totals.r / kept.length),
    Math.round(totals.g / kept.length),
    Math.round(totals.b / kept.length),
  ];

  return { rgb, hex: `#${rgb.map(toHex).join('')}` };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
