export type CaptureMode = 'object' | 'color' | 'contour';

export interface ClipboardItem {
  id: string;
  type: CaptureMode;
  createdAt: number;
  sourceFrame?: string;
  previewImage?: string;
  maskImage?: string;
  bbox?: { x: number; y: number; width: number; height: number };
  color?: { hex: string; rgb: [number, number, number] };
  contour?: Array<[number, number]>;
  spatial?: { x: number; y: number; scale: number; rotation: number };
}
