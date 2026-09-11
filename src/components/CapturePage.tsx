import { useEffect, useRef } from 'react';
import type { CaptureMode } from '../lib/capture';
import { drawDemoScene, findDemoObjectAt, type DemoObject } from '../lib/demoScene';
import type { NormalizedPoint } from '../lib/pinch';
import { MiniHeader } from './MiniHeader';

type CapturePageProps = {
  mode: CaptureMode;
  onModeChange: (mode: CaptureMode) => void;
  onCapture: (object: DemoObject, point: NormalizedPoint) => void;
};

const MODES: Array<{ id: CaptureMode; icon: string; label: string }> = [
  { id: 'object', icon: '◇', label: '物体' },
  { id: 'color', icon: '◯', label: '颜色' },
  { id: 'contour', icon: '▱', label: '轮廓' },
];

const MODE_GUIDES: Record<CaptureMode, string> = {
  object: '捏合目标，复制完整物体',
  color: '捏合目标，提取代表颜色',
  contour: '捏合目标，留下形状轮廓',
};

export function CapturePage({ mode, onModeChange, onCapture }: CapturePageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawDemoScene(canvasRef.current);
  }, []);

  function captureAt(point: NormalizedPoint) {
    const object = findDemoObjectAt(point);
    if (object) onCapture(object, point);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    captureAt({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }

  return (
    <section className="mini-page capture-page" aria-labelledby="capture-title">
      <h1 id="capture-title" className="sr-only">捕捉现实</h1>
      <canvas
        ref={canvasRef}
        width="720"
        height="1280"
        onPointerDown={handlePointerDown}
        aria-label="模拟摄像头画面，点击小猫、马克杯或绿植抓取"
      />
      <div className="capture-shade" aria-hidden="true" />
      <MiniHeader dark />

      <div className="demo-chip"><i aria-hidden="true" /> DEMO CAMERA</div>

      <div className="gesture-guide" aria-hidden="true">
        <span className="pinch-glyph">⌁</span>
        <p>用手势<br />抓取现实物体</p>
        <b>↙</b>
      </div>

      <button
        type="button"
        className="capture-hotspot"
        onClick={() => onCapture({ id: 'cat', label: '小猫摆件' }, { x: 0.5, y: 0.65 })}
        aria-label="抓取小猫摆件"
      >
        <span aria-hidden="true" />
      </button>

      <div className="capture-controls">
        <p className="capture-intent" role="status">{MODE_GUIDES[mode]}</p>
        <div className="mode-switch" aria-label="捕捉类型">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => onModeChange(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <p className="capture-footer">伸出手，抓住现实世界</p>
      </div>
    </section>
  );
}
