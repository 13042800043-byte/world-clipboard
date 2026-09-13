import { describe, expect, it, vi } from 'vitest';
import { RemoteSegmentationAdapter } from '../../miniprogram/vision/remote-segmentation-adapter';

const input = {
  image: 'tmp://frame.jpg',
  point: { x: 0.52, y: 0.61 },
  mode: 'object' as const,
};

describe('remote segmentation adapter', () => {
  const contourResponse = {
    success: true, mode: 'contour',
    preview: 'data:image/png;base64,silhouette', mask: 'data:image/png;base64,mask',
    bbox: { x: .3, y: .2, width: .4, height: .5 },
    contour: [[.3, .2], [.7, .2], [.7, .7], [.3, .7]],
  };
  const contourAdapter = (payload: unknown) => new RemoteSegmentationAdapter('http://server:8000', options => {
    options.success({ statusCode: 200, data: JSON.stringify(payload) });
  });

  it('preserves real contour geometry and silhouette preview on ClipboardItem', async () => {
    const item = await contourAdapter(contourResponse).segment({ ...input, mode: 'contour' });
    expect(item.type).toBe('contour');
    expect(item.contour).toEqual(contourResponse.contour);
    expect(item.previewImage).toBe(contourResponse.preview);
  });

  it('rejects an old contour backend instead of silently displaying a colored cutout', async () => {
    const { contour: _polygon, ...oldResponse } = contourResponse;
    await expect(contourAdapter(oldResponse).segment({ ...input, mode: 'contour' }))
      .rejects.toThrow('请更新后端');
  });

  it.each([[], [[0, 0], [1, 0]], [[0, 0], [1, 0], [2, 1]],
    [[0, 0], [1, 0], [NaN, 1]], Array.from({ length: 1025 }, () => [0, 0])].map(contour => ({ contour })))
    ('rejects invalid or oversized contour geometry %#', async ({ contour }) => {
      await expect(contourAdapter({ ...contourResponse, contour }).segment({ ...input, mode: 'contour' }))
        .rejects.toThrow('invalid segmentation response');
    });

  it('rejects a response for another capture mode', async () => {
    await expect(contourAdapter(contourResponse).segment(input)).rejects.toThrow('mode mismatch');
  });

  it('serializes point, box and hand negatives and preserves retry error codes', async () => {
    const uploadFile = vi.fn(options => options.success({ statusCode: 422,
      data: JSON.stringify({ error: { code: 'BLURRY_CAPTURE', message: 'hold still' } }) }));
    const adapter = new RemoteSegmentationAdapter('http://127.0.0.1:8000', uploadFile);
    const prompt = { positivePoints: [input.point], negativePoints: [{ x: .2, y: .8 }], box: { x: .3, y: .2, width: .4, height: .5 } };
    await expect(adapter.segment({ ...input, prompt })).rejects.toMatchObject({ code: 'BLURRY_CAPTURE' });
    expect(uploadFile.mock.calls[0][0].formData.prompt).toBe(JSON.stringify(prompt));
  });

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

  it('turns wx.uploadFile failures into actionable errors', async () => {
    const adapter = new RemoteSegmentationAdapter('http://192.168.67.18:8000', (options) => {
      options.fail({ errMsg: 'uploadFile:fail socket timeout' });
    });

    await expect(adapter.segment(input)).rejects.toThrow('uploadFile:fail socket timeout');
  });

  it('surfaces the backend error message for rejected captures', async () => {
    const adapter = new RemoteSegmentationAdapter('http://192.168.67.18:8000', (options) => {
      options.success({
        statusCode: 422,
        data: JSON.stringify({
          error: { code: 'SEGMENTATION_FAILED', message: 'no foreground around the grab point' },
        }),
      });
    });

    await expect(adapter.segment(input)).rejects.toThrow('no foreground around the grab point');
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

  it('gives final upload 25 seconds and uses a shorter 4 second hover budget', async () => {
    const upload = vi.fn(options => options.success({ statusCode: 200, data: JSON.stringify({
      success: true, mode: 'object', preview: 'data:image/png;base64,preview', mask: 'data:image/png;base64,mask',
      bbox: { x: .3, y: .2, width: .4, height: .5 },
    }) }));
    const adapter = new RemoteSegmentationAdapter('http://server:8000', upload);
    await adapter.segment(input);
    await adapter.select(input);
    expect(upload.mock.calls[0][0].timeout).toBe(25000);
    expect(upload.mock.calls[1][0].timeout).toBe(4000);
  });

  it('ignores late success after timeout and permits the next independent capture', async () => {
    vi.useFakeTimers();
    try {
      let first: Parameters<ConstructorParameters<typeof RemoteSegmentationAdapter>[1]>[0] | undefined;
      // Capture native callbacks without performing a real upload.
      const upload = vi.fn(options => { first = options; return { abort: vi.fn() }; });
      const adapter = new RemoteSegmentationAdapter('http://server:8000', upload, 50);
      const pending = adapter.segment(input);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'SEGMENTATION_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(51);
      await assertion;
      first?.success({ statusCode: 200, data: '{}' });
      const next = adapter.segment(input);
      const nextAssertion = expect(next).rejects.toMatchObject({ code: 'SEGMENTATION_TIMEOUT' });
      await vi.advanceTimersByTimeAsync(51);
      await nextAssertion;
      expect(upload).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
