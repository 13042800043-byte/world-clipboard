import { describe, expect, it, vi } from 'vitest';
import {
  CameraPhotoCapture,
  VisionKitCanvasCapture,
} from '../../miniprogram/vision/frame-capture';

describe('camera frame capture adapters', () => {
  it('exports the current VisionKit WebGL canvas as a JPEG file', async () => {
    const canvas = { width: 750, height: 1334 };
    const exportCanvas = vi.fn((options) => options.success({ tempFilePath: 'tmp://vk.jpg' }));
    const capture = new VisionKitCanvasCapture(canvas, exportCanvas);

    await expect(capture.capture()).resolves.toBe('tmp://vk.jpg');
    expect(exportCanvas).toHaveBeenCalledWith(expect.objectContaining({
      canvas,
      fileType: 'jpg',
      quality: 0.86,
    }));
  });

  it('uses CameraContext.takePhoto for the native camera fallback', async () => {
    const takePhoto = vi.fn((options) => options.success({ tempImagePath: 'tmp://camera.jpg' }));
    const capture = new CameraPhotoCapture({ takePhoto });

    await expect(capture.capture()).resolves.toBe('tmp://camera.jpg');
    expect(takePhoto).toHaveBeenCalledWith(expect.objectContaining({ quality: 'normal' }));
  });

  it('rejects when the platform capture API fails', async () => {
    const capture = new CameraPhotoCapture({
      takePhoto: (options) => options.fail(new Error('camera unavailable')),
    });

    await expect(capture.capture()).rejects.toThrow('camera unavailable');
  });
});
