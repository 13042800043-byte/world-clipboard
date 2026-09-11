export type NormalizedPoint = { x: number; y: number };
export type HandLandmark = NormalizedPoint & { z: number };
export type HandResult = { landmarks: HandLandmark[]; cursor: NormalizedPoint; detected: boolean };

export interface HandTracker {
  processFrame(frame: unknown): Promise<HandResult>;
}

export class MockHandTracker implements HandTracker {
  async processFrame(frame: unknown): Promise<HandResult> {
    const cursor = isPoint(frame) ? frame : { x: 0.5, y: 0.56 };
    return {
      detected: true,
      cursor,
      landmarks: createMockLandmarks(cursor),
    };
  }
}

function createMockLandmarks(cursor: NormalizedPoint): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: cursor.x + (index === 4 ? -0.015 : index === 8 ? 0.015 : 0),
    y: cursor.y,
    z: 0,
  }));
}

function isPoint(value: unknown): value is NormalizedPoint {
  return Boolean(value && typeof value === 'object' && 'x' in value && 'y' in value);
}
