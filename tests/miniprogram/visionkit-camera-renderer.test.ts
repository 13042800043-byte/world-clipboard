import { describe, expect, it, vi } from 'vitest';
import { createVisionKitCameraRenderer } from '../../miniprogram/vision/visionkit-camera-renderer';

describe('VisionKit camera renderer', () => {
  it('reports an actionable error when WebGL is unavailable', () => {
    const getContext = vi.fn(() => null);

    expect(() => createVisionKitCameraRenderer({
      width: 1,
      height: 1,
      getContext,
    })).toThrow('WebGL');
    expect(getContext).toHaveBeenCalledWith('webgl', { preserveDrawingBuffer: true });
  });
});
