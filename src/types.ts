import type { DemoObject } from './lib/demoScene';
import type { CaptureMode } from './lib/capture';

export type WorldClipboardItem = {
  id: string;
  label: string;
  type: CaptureMode;
  typeLabel: string;
  source: DemoObject['id'] | 'camera';
  createdAt: number;
  previewUrl: string;
  imageData: Pick<ImageData, 'data' | 'width' | 'height'>;
  spatial: {
    x: number;
    y: number;
    scale: number;
    rotation: number;
  };
};
