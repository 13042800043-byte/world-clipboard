import type { DemoObject } from './lib/demoScene';

export type WorldClipboardItem = {
  id: string;
  label: string;
  source: DemoObject['id'] | 'camera';
  createdAt: number;
  previewUrl: string;
  imageData: Pick<ImageData, 'data' | 'width' | 'height'>;
};

