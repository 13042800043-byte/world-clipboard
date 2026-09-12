export interface FrameCapture {
  capture(): Promise<string>;
}

type WebGLCaptureCanvas = { toDataURL(type: string, quality: number): string };
type ImageWriter = (dataUrl: string) => Promise<string>;

function platformError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error && typeof error === 'object' && 'errMsg' in error) {
    const message = (error as { errMsg?: unknown }).errMsg;
    if (typeof message === 'string' && message) return new Error(message);
  }
  return new Error(typeof error === 'string' ? error : '平台接口未返回错误详情');
}

function writeCaptureImage(dataUrl: string): Promise<string> {
  const match = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return Promise.reject(new Error('WebGL 未导出有效 JPEG/PNG 画面'));
  if (match[2].length > 7_000_000) return Promise.reject(new Error('截图过大，请降低画面分辨率'));
  // One app-owned file is reused so repeated grabs never fill phone storage.
  const extension = match[1] === 'jpeg' ? 'jpg' : 'png';
  const filePath = `${wx.env.USER_DATA_PATH}/world-clipboard-frame.${extension}`;
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data: match[2],
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: (error) => reject(platformError(error)),
    });
  });
}

type CameraContext = {
  takePhoto(options: {
    quality: 'normal';
    success(result: { tempImagePath: string }): void;
    fail(error: unknown): void;
  }): void;
};

export class VisionKitCanvasCapture implements FrameCapture {
  constructor(
    private readonly canvas: WebGLCaptureCanvas,
    private readonly saveImage: ImageWriter = writeCaptureImage,
  ) {}

  async capture(): Promise<string> {
    try {
      return await this.saveImage(this.canvas.toDataURL('image/jpeg', 0.86));
    } catch (error) {
      throw platformError(error);
    }
  }
}

export class CameraPhotoCapture implements FrameCapture {
  constructor(private readonly context: CameraContext = wx.createCameraContext()) {}

  capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.context.takePhoto({
        quality: 'normal',
        success: ({ tempImagePath }) => resolve(tempImagePath),
        fail: (error) => reject(platformError(error)),
      });
    });
  }
}
