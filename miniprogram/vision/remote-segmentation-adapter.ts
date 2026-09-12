import type { ClipboardItem } from '../clipboard/clipboard-types';
import { parseSegmentResponse, segmentApiUrl } from '../services/vision-api';
import type { SegmentationInput, Segmenter } from './segmentation-adapter';

type UploadResult = { statusCode: number; data: string };
type UploadOptions = {
  url: string;
  filePath: string;
  name: string;
  formData: Record<string, string>;
  success(result: UploadResult): void;
  fail(error: unknown): void;
};
type UploadTask = { abort?(): void };
type UploadFile = (options: UploadOptions) => UploadTask | void;

function normalizeUploadError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'errMsg' in error) {
    const message = (error as { errMsg?: unknown }).errMsg;
    if (typeof message === 'string' && message) return new Error(message);
  }
  return new Error('uploadFile failed without an error message');
}

function backendErrorMessage(data: string): string | undefined {
  try {
    const payload = JSON.parse(data) as unknown;
    if (!payload || typeof payload !== 'object' || !('error' in payload)) return undefined;
    const apiError = (payload as { error?: unknown }).error;
    if (!apiError || typeof apiError !== 'object' || !('message' in apiError)) return undefined;
    const message = (apiError as { message?: unknown }).message;
    return typeof message === 'string' && message.trim()
      ? message.trim().slice(0, 120)
      : undefined;
  } catch {
    return undefined;
  }
}

export class RemoteSegmentationAdapter implements Segmenter {
  constructor(
    private readonly baseUrl: string,
    private readonly uploadFile: UploadFile = (options) => wx.uploadFile(options),
    private readonly timeoutMs = 8000,
  ) {}

  async segment(input: SegmentationInput): Promise<ClipboardItem> {
    if (input.mode === 'color') throw new Error('color capture is handled on device');

    const response = await new Promise<ReturnType<typeof parseSegmentResponse>>((resolve, reject) => {
      let task: UploadTask | void;
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        callback();
      };
      const timeout = setTimeout(() => {
        finish(() => {
          if (task) task.abort?.();
          reject(new Error('segmentation request timed out'));
        });
      }, this.timeoutMs);

      task = this.uploadFile({
        url: segmentApiUrl(this.baseUrl),
        filePath: input.image,
        name: 'image',
        formData: {
          pointX: String(input.point.x),
          pointY: String(input.point.y),
          mode: input.mode,
        },
        success(result) {
          if (result.statusCode < 200 || result.statusCode >= 300) {
            const detail = backendErrorMessage(result.data);
            const message = detail
              ? `segmentation request failed (${result.statusCode}): ${detail}`
              : `segmentation request failed (${result.statusCode})`;
            finish(() => reject(new Error(message)));
            return;
          }
          try {
            const parsed = parseSegmentResponse(JSON.parse(result.data) as unknown);
            finish(() => resolve(parsed));
          } catch (error) {
            finish(() => reject(error));
          }
        },
        fail: (error) => finish(() => reject(normalizeUploadError(error))),
      });
    });

    return {
      id: `remote-${response.mode}-${Date.now()}`,
      type: response.mode,
      createdAt: Date.now(),
      sourceFrame: input.image,
      previewImage: response.preview,
      maskImage: response.mask,
      bbox: response.bbox,
      spatial: { x: input.point.x, y: input.point.y, scale: 1, rotation: 0 },
    };
  }
}
