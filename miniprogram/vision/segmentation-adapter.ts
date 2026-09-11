import type { CaptureMode, ClipboardItem } from '../clipboard/clipboard-types';
import type { NormalizedPoint } from './hand-tracker';

export type SegmentationInput = {
  image: string;
  point: NormalizedPoint;
  mode: CaptureMode;
};

export interface Segmenter {
  segment(input: SegmentationInput): Promise<ClipboardItem>;
}

export class MockSegmentationAdapter implements Segmenter {
  async segment(input: SegmentationInput): Promise<ClipboardItem> {
    const base: ClipboardItem = {
      id: `mock-${input.mode}-${Date.now()}`,
      type: input.mode,
      createdAt: Date.now(),
      sourceFrame: input.image,
      bbox: { x: 0.3, y: 0.28, width: 0.4, height: 0.48 },
      spatial: { x: input.point.x, y: input.point.y, scale: 1, rotation: 0 },
    };

    if (input.mode === 'color') {
      return { ...base, color: { hex: '#6E747A', rgb: [110, 116, 122] } };
    }
    if (input.mode === 'contour') {
      return {
        ...base,
        previewImage: 'mock://cat-contour',
        maskImage: 'mock://cat-mask',
        contour: [[0.3, 0.2], [0.7, 0.2], [0.76, 0.72], [0.24, 0.72]],
      };
    }
    return {
      ...base,
      previewImage: 'mock://cat-object',
      maskImage: 'mock://cat-mask',
    };
  }
}
