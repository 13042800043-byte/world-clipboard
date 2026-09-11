import type { SegmentationInput } from '../vision/segmentation-adapter';

export const SEGMENT_API_PATH = '/api/segment';

export function createSegmentRequest(input: SegmentationInput): {
  url: string;
  method: 'POST';
  data: SegmentationInput;
} {
  return { url: SEGMENT_API_PATH, method: 'POST', data: input };
}
