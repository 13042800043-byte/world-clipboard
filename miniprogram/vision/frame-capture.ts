export interface FrameCapture {
  capture(): Promise<string>;
}

type CanvasExporter = (options: {
  canvas: unknown;
  fileType: 'jpg';
  quality: number;
  success(result: { tempFilePath: string }): void;
  fail(error: unknown): void;
}) => void;

type CameraContext = {
  takePhoto(options: {
    quality: 'normal';
    success(result: { tempImagePath: string }): void;
    fail(error: unknown): void;
  }): void;
};

export class VisionKitCanvasCapture implements FrameCapture {
  constructor(
    private readonly canvas: unknown,
    private readonly exportCanvas: CanvasExporter = (options) => wx.canvasToTempFilePath(options),
  ) {}

  capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.exportCanvas({
        canvas: this.canvas,
        fileType: 'jpg',
        quality: 0.86,
        success: ({ tempFilePath }) => resolve(tempFilePath),
        fail: reject,
      });
    });
  }
}

export class CameraPhotoCapture implements FrameCapture {
  constructor(private readonly context: CameraContext = wx.createCameraContext()) {}

  capture(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.context.takePhoto({
        quality: 'normal',
        success: ({ tempImagePath }) => resolve(tempImagePath),
        fail: reject,
      });
    });
  }
}
