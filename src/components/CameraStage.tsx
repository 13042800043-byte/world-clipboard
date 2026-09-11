import { useEffect, useRef } from 'react';
import {
  DEMO_OBJECTS,
  drawDemoScene,
  findDemoObjectAt,
  type DemoObject,
} from '../lib/demoScene';
import type { NormalizedPoint } from '../lib/pinch';

type CameraStageProps = {
  onObjectSelected: (object: DemoObject, point: NormalizedPoint) => void;
  selectionPoint?: NormalizedPoint;
};

export function CameraStage({ onObjectSelected, selectionPoint }: CameraStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawDemoScene(canvasRef.current);
  }, []);

  function selectAt(point: NormalizedPoint) {
    const object = findDemoObjectAt(point);
    if (object) onObjectSelected(object, point);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    selectAt({
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    });
  }

  return (
    <section className="camera-stage" aria-label="世界剪贴板演示画面">
      <canvas
        ref={canvasRef}
        width="1280"
        height="720"
        onPointerDown={handlePointerDown}
        aria-label="点击画面中的马克杯或绿植进行复制"
      />

      <div className="stage-badge">
        <span className="live-dot" aria-hidden="true" />
        SIMULATED CAMERA
      </div>

      <div className="stage-guide" aria-hidden="true">
        <span>1</span>
        <p><strong>抓住</strong>一个现实物体</p>
      </div>

      {selectionPoint && (
        <span
          className="selection-reticle"
          style={{ left: `${selectionPoint.x * 100}%`, top: `${selectionPoint.y * 100}%` }}
          aria-hidden="true"
        />
      )}

      <div className="object-shortcuts" aria-label="演示对象快捷操作">
        {DEMO_OBJECTS.map((object) => (
          <button
            key={object.id}
            type="button"
            onClick={() =>
              onObjectSelected(
                object,
                object.id === 'mug' ? { x: 0.28, y: 0.58 } : { x: 0.69, y: 0.4 },
              )
            }
          >
            抓取{object.label}
          </button>
        ))}
      </div>
    </section>
  );
}

