import type { ClipboardItem } from '../clipboard/clipboard-types';
import { parseSegmentResponse, segmentApiUrl } from '../services/vision-api';
import type { SegmentationInput, Segmenter } from './segmentation-adapter';
import { CUTOUT_CONFIG } from './cutout-config';

type UploadResult = { statusCode: number; data: string };
type UploadOptions = {
  url: string;
  filePath: string;
  name: string;
  timeout: number;
  formData: Record<string, string>;
  success(result: UploadResult): void;
  fail(error: unknown): void;
};
type UploadTask = { abort?(): void };
type UploadFile = (options: UploadOptions) => UploadTask | void;

export class VisionApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); this.name = 'VisionApiError'; }
}

function backendErrorCode(data: string): string | undefined {
  try {
    const value = JSON.parse(data)?.error?.code;
    return typeof value === 'string' ? value.slice(0, 60) : undefined;
  } catch { return undefined; }
}

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
    private readonly timeoutMs?: number,
  ) {}

  async segment(input: SegmentationInput): Promise<ClipboardItem> {
    const response = await this.request(input, 'final');
    if (response.mode !== input.mode) throw new Error('segmentation response mode mismatch');
    if (input.mode === 'contour' && !response.contour) {
      throw new Error('轮廓服务版本过旧，请更新后端后重新抓取');
    }
    if (input.debug && response.debug) console.info('Final cutout diagnostics', response.debug);
    return {
      id: `remote-${response.mode}-${Date.now()}`,
      type: response.mode,
      createdAt: Date.now(),
      sourceFrame: input.image,
      previewImage: response.preview,
      maskImage: response.mask,
      bbox: response.bbox,
      ...(response.mode === 'contour' ? { contour: response.contour } : {}),
      spatial: { x: input.point.x, y: input.point.y, scale: 1, rotation: 0 },
    };
  }

  select(input: SegmentationInput): Promise<ReturnType<typeof parseSegmentResponse>> {
    return this.request(input, 'selection');
  }

  private async request(input: SegmentationInput, stage: 'selection' | 'final'): Promise<ReturnType<typeof parseSegmentResponse>> {
    if (input.mode === 'color') throw new Error('color capture is handled on device');
    const timeoutMs = this.timeoutMs ?? (stage === 'final'
      ? CUTOUT_CONFIG.FINAL_REQUEST_TIMEOUT_MS : CUTOUT_CONFIG.SELECTION_REQUEST_TIMEOUT_MS);
    const startedAt = Date.now();

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
          // Settle before abort: native abort may synchronously call fail.
          reject(new VisionApiError(`segmentation request timed out：${stage === 'final' ? '最终抠图' : '悬停选取'}超过 ${Math.round(timeoutMs / 1000)} 秒，请确认手机与电脑同网且后端已启动`, 'SEGMENTATION_TIMEOUT'));
          try { if (task) task.abort?.(); } catch (error) { console.warn('segmentation abort failed', error); }
        });
      }, timeoutMs);

      task = this.uploadFile({
        url: segmentApiUrl(this.baseUrl),
        filePath: input.image,
        name: 'image',
        timeout: timeoutMs,
        formData: {
          pointX: String(input.point.x),
          pointY: String(input.point.y),
          mode: input.mode,
          ...(stage === 'selection' ? { stage } : {}),
          ...(input.prompt ? { prompt: JSON.stringify(input.prompt) } : {}),
          ...(input.debug ? { debug: 'true' } : {}),
        },
        success: (result) => {
          if (settled) return;
          if (input.debug) console.info('Segmentation request timing', { stage, elapsedMs: Date.now() - startedAt, statusCode: result.statusCode });
          if (result.statusCode < 200 || result.statusCode >= 300) {
            const detail = backendErrorMessage(result.data);
            const message = detail
              ? `segmentation request failed (${result.statusCode}): ${detail}`
              : `segmentation request failed (${result.statusCode})`;
            finish(() => reject(new VisionApiError(message, backendErrorCode(result.data))));
            return;
          }
          try {
            const parsed = parseSegmentResponse(JSON.parse(result.data) as unknown);
            finish(() => resolve(parsed));
          } catch (error) {
            finish(() => reject(error));
          }
        },
        fail: (error) => finish(() => {
          const normalized = normalizeUploadError(error);
          if (/timeout|timed out/i.test(normalized.message)) {
            reject(new VisionApiError(`${normalized.message}：${stage === 'final' ? '最终抠图' : '悬停选取'}网络请求超时，请检查后端连接`, 'SEGMENTATION_TIMEOUT'));
          } else reject(normalized);
        }),
      });
    });

    return response;
  }
}
