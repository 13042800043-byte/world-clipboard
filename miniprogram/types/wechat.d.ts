declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare function Component(options: Record<string, unknown>): void;

declare const wx: {
  env: { USER_DATA_PATH: string };
  getFileSystemManager(): {
    writeFile(options: {
      filePath: string;
      data: string;
      encoding: 'base64';
      success(): void;
      fail(error: unknown): void;
    }): void;
  };
  navigateTo(options: { url: string; success?: () => void; fail?: (error: unknown) => void }): void;
  navigateBack(options?: { delta?: number }): void;
  showToast(options: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void;
  pageScrollTo(options: { selector?: string; scrollTop?: number; duration?: number }): void;
  // https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts
  previewImage(options: { urls: string[]; current?: string; fail?: (error: unknown) => void }): void;
  getWindowInfo(): { windowWidth: number; windowHeight: number; pixelRatio?: number; statusBarHeight?: number; screenHeight?: number; safeArea?: { bottom: number } };
  getMenuButtonBoundingClientRect?(): { width: number; height: number; top: number; bottom: number; left: number; right: number };
  setNavigationBarColor?(options: { frontColor: '#ffffff' | '#000000'; backgroundColor: string }): void;
  getImageInfo(options: { src: string; success(result: { width: number; height: number; orientation?: string }): void; fail(error: unknown): void }): void;
  nextTick(callback: () => void): void;
  createSelectorQuery(): {
    select(selector: string): {
      node(): {
        exec(callback: (result: Array<{ node?: any }>) => void): void;
      };
    };
  };
  createCameraContext(): {
    onCameraFrame(callback: (frame: { data: ArrayBuffer; width: number; height: number }) => void): {
      start(): void;
      stop(): void;
    };
    takePhoto(options: {
      quality: 'normal' | 'high';
      success(result: { tempImagePath: string }): void;
      fail(error: unknown): void;
    }): void;
  };
  canvasToTempFilePath(options: {
    canvas: unknown;
    fileType: 'jpg';
    quality: number;
    success(result: { tempFilePath: string }): void;
    fail(error: unknown): void;
  }): void;
  uploadFile(options: {
    url: string;
    filePath: string;
    name: string;
    formData: Record<string, string>;
    success(result: { statusCode: number; data: string }): void;
    fail(error: unknown): void;
  }): { abort?(): void };
  request(options: {
    url: string;
    method: 'POST';
    header: { 'content-type': 'application/json' };
    data: Record<string, unknown>;
    timeout: number;
    success(result: { statusCode: number; data: unknown }): void;
    fail(error: unknown): void;
  }): unknown;
  createVKSession(options: {
    track: { plane: { mode: number }; hand: { mode: number } };
    version: string;
    gl: unknown;
  }): any;
};

interface MiniProgramTouch {
  clientX: number;
  clientY: number;
}

interface MiniProgramTouchEvent {
  touches: MiniProgramTouch[];
  changedTouches: MiniProgramTouch[];
  currentTarget: { dataset: Record<string, string> };
}
