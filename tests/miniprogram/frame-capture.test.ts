import { describe, expect, it, vi } from 'vitest';
import {
  CameraPhotoCapture,
  VisionKitCanvasCapture,
} from '../../miniprogram/vision/frame-capture';

describe('camera frame capture adapters', () => {
  it('serializes writes so a cancelled older Grab cannot overwrite the next frame', async () => {
    const pending: Array<{ success(): void }> = [];
    const writeFile = vi.fn((options) => pending.push(options));
    vi.stubGlobal('wx', { env: { USER_DATA_PATH: 'wxfile://usr' }, getFileSystemManager: () => ({ writeFile }) });
    try {
      const capture = new VisionKitCanvasCapture({ toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=' });
      const first = capture.capture(); const second = capture.capture();
      await Promise.resolve(); await Promise.resolve();
      expect(writeFile).toHaveBeenCalledTimes(1);
      pending[0].success(); await first; await Promise.resolve();
      expect(writeFile).toHaveBeenCalledTimes(2);
      pending[1].success(); await second;
    } finally { vi.unstubAllGlobals(); }
  });
  it('exports the current VisionKit WebGL canvas as a JPEG file', async () => {
    const canvas = { toDataURL: vi.fn(() => 'data:image/jpeg;base64,aGVsbG8=') };
    const saveImage = vi.fn(async () => 'tmp://vk.jpg');
    const capture = new VisionKitCanvasCapture(canvas, saveImage);

    await expect(capture.capture()).resolves.toBe('tmp://vk.jpg');
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.86);
    expect(saveImage).toHaveBeenCalledWith('data:image/jpeg;base64,aGVsbG8=');
  });

  it('preserves platform errMsg objects instead of hiding the capture cause', async () => {
    const capture = new VisionKitCanvasCapture(
      { toDataURL: () => { throw { errMsg: 'toDataURL:fail WebGL export failed' }; } },
      async () => 'unused.jpg',
    );

    await expect(capture.capture()).rejects.toThrow('toDataURL:fail WebGL export failed');
  });

  it('writes the WebGL JPEG base64 to a bounded local capture file', async () => {
    const writeFile = vi.fn((options) => options.success());
    vi.stubGlobal('wx', {
      env: { USER_DATA_PATH: 'wxfile://usr' },
      getFileSystemManager: () => ({ writeFile }),
    });
    try {
      const capture = new VisionKitCanvasCapture({
        toDataURL: () => 'data:image/jpeg;base64,aGVsbG8=',
      });
      await expect(capture.capture()).resolves.toBe('wxfile://usr/world-clipboard-frame.jpg');
      expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
        filePath: 'wxfile://usr/world-clipboard-frame.jpg',
        data: 'aGVsbG8=',
        encoding: 'base64',
      }));
    } finally {
      vi.unstubAllGlobals();
    }
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
