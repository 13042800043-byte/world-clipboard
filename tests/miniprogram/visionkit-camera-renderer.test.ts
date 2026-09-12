import { describe, expect, it } from 'vitest';
import { createVisionKitCameraRenderer } from '../../miniprogram/vision/visionkit-camera-renderer';

describe('VisionKit camera renderer', () => {
  it('reports an actionable error when WebGL is unavailable', () => {
    expect(() => createVisionKitCameraRenderer({
      width: 1,
      height: 1,
      getContext: () => null,
    })).toThrow('WebGL');
  });
});
