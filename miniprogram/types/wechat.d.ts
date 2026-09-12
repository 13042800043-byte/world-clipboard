declare function App(options: Record<string, unknown>): void;
declare function Page(options: Record<string, unknown>): void;
declare function Component(options: Record<string, unknown>): void;

declare const wx: {
  navigateTo(options: { url: string; success?: () => void; fail?: (error: unknown) => void }): void;
  navigateBack(options?: { delta?: number }): void;
  showToast(options: { title: string; icon?: 'success' | 'error' | 'loading' | 'none'; duration?: number }): void;
  pageScrollTo(options: { selector?: string; scrollTop?: number; duration?: number }): void;
  getWindowInfo(): { windowWidth: number; windowHeight: number; pixelRatio?: number; statusBarHeight?: number };
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
  };
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
