import type { CaptureMode } from '../clipboard/clipboard-types';

export const SEGMENT_API_PATH = '/api/segment';

export type SegmentApiSuccess = {
  success: true;
  mode: Exclude<CaptureMode, 'color'>;
  preview: string;
  mask: string;
  bbox: { x: number; y: number; width: number; height: number };
  outline?: string;
  /** Largest outer ring, normalized to the original photo, not the cropped PNG. */
  contour?: Array<[number, number]>;
  debug?: Record<string, unknown>;
};

export function segmentApiUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}${SEGMENT_API_PATH}`;
}

function isNormalizedBox(value: unknown): value is SegmentApiSuccess['bbox'] {
  if (!value || typeof value !== 'object') return false;
  const box = value as Record<string, unknown>;
  const numbers = [box.x, box.y, box.width, box.height];
  if (!numbers.every((item) => typeof item === 'number' && Number.isFinite(item))) return false;

  const { x, y, width, height } = box as SegmentApiSuccess['bbox'];
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 1.001 && y + height <= 1.001;
}

export function parseSegmentResponse(value: unknown): SegmentApiSuccess {
  if (!value || typeof value !== 'object') throw new Error('invalid segmentation response');
  const response = value as Record<string, unknown>;
  const isMode = response.mode === 'object' || response.mode === 'contour';
  const isPngData = (item: unknown): item is string => (
    typeof item === 'string' && item.startsWith('data:image/png;base64,')
  );

  if (
    response.success !== true
    || !isMode
    || !isPngData(response.preview)
    || !isPngData(response.mask)
    || !isNormalizedBox(response.bbox)
    || (response.outline !== undefined && !isPngData(response.outline))
    || (response.contour !== undefined && !isNormalizedContour(response.contour))
    || (response.debug !== undefined && (!response.debug || typeof response.debug !== 'object' || Array.isArray(response.debug)))
  ) {
    throw new Error('invalid segmentation response');
  }

  return response as SegmentApiSuccess;
}

function isNormalizedContour(value: unknown): value is Array<[number, number]> {
  return Array.isArray(value) && value.length >= 3 && value.length <= 1024
    && value.every(point => Array.isArray(point) && point.length === 2
      && point.every(coordinate => typeof coordinate === 'number'
        && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1));
}
