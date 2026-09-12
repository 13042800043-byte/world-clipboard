import { describe, expect, it, vi } from 'vitest';
import { MockSegmentationAdapter } from '../../miniprogram/vision/segmentation-adapter';
import {
  FallbackSegmentationAdapter,
  RemoteSegmentationAdapter,
} from '../../miniprogram/vision/remote-segmentation-adapter';

const input = {
  image: 'tmp://frame.jpg',
  point: { x: 0.52, y: 0.61 },
  mode: 'object' as const,
};

describe('remote segmentation adapter', () => {
  it('uploads the captured frame and maps a validated response to ClipboardItem', async () => {
    const uploadFile = vi.fn((options) => options.success({
      statusCode: 200,
      data: JSON.stringify({
        success: true,
        mode: 'object',
        preview: 'data:image/png;base64,preview',
        mask: 'data:image/png;base64,mask',
        bbox: { x: 0.3, y: 0.2, width: 0.4, height: 0.5 },
      }),
    }));
    const adapter = new RemoteSegmentationAdapter('http://127.0.0.1:8000', uploadFile);

    const item = await adapter.segment(input);

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'http://127.0.0.1:8000/api/segment',
      filePath: 'tmp://frame.jpg',
      name: 'image',
      formData: { pointX: '0.52', pointY: '0.61', mode: 'object' },
    }));
    expect(item.type).toBe('object');
    expect(item.previewImage).toBe('data:image/png;base64,preview');
    expect(item.maskImage).toBe('data:image/png;base64,mask');
    expect(item.spatial).toEqual({ x: 0.52, y: 0.61, scale: 1, rotation: 0 });
  });

  it('rejects malformed server responses at the API boundary', async () => {
    const adapter = new RemoteSegmentationAdapter('http://127.0.0.1:8000', (options) => {
      options.success({ statusCode: 200, data: '{"success":true}' });
    });

    await expect(adapter.segment(input)).rejects.toThrow('invalid segmentation response');
  });

  it('falls back to the mock segmenter when the backend cannot be reached', async () => {
    const remote = { segment: vi.fn().mockRejectedValue(new Error('offline')) };
    const adapter = new FallbackSegmentationAdapter(remote, new MockSegmentationAdapter());

    const item = await adapter.segment(input);

    expect(item.previewImage).toBe('mock://cat-object');
  });

  it('aborts a stalled upload so the demo can fall back promptly', async () => {
    vi.useFakeTimers();
    const abort = vi.fn();
    const adapter = new RemoteSegmentationAdapter(
      'http://127.0.0.1:8000',
      (options) => ({
        abort: () => {
          abort();
          options.fail(new Error('request:fail abort'));
        },
      }),
      50,
    );

    const pending = adapter.segment(input);
    const assertion = expect(pending).rejects.toThrow('segmentation request timed out');
    await vi.advanceTimersByTimeAsync(51);

    await assertion;
    expect(abort).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
