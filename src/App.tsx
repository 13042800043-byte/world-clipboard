import { useState } from 'react';
import { CapturePage } from './components/CapturePage';
import { CreatePage } from './components/CreatePage';
import { applyCaptureMode, pixelsToDataUrl, type CaptureMode } from './lib/capture';
import { renderDemoObject, type DemoObject } from './lib/demoScene';
import { createPerlerPattern, type PerlerPattern } from './lib/perler';
import type { NormalizedPoint } from './lib/pinch';
import type { WorldClipboardItem } from './types';

export function App() {
  const [page, setPage] = useState<'capture' | 'create'>('capture');
  const [mode, setMode] = useState<CaptureMode>('object');
  const [clipboard, setClipboard] = useState<WorldClipboardItem>();
  const [pattern, setPattern] = useState<PerlerPattern>();

  function copyObject(object: DemoObject, point: NormalizedPoint) {
    const capture = renderDemoObject(object);
    const imageData = applyCaptureMode(capture.imageData, mode);
    const typeLabel = mode === 'object' ? '完整物体' : mode === 'color' ? '代表颜色' : '轮廓剪影';
    setClipboard({
      id: `${object.id}-${Date.now()}`,
      label: mode === 'object' ? object.label : `${object.label} · ${typeLabel}`,
      type: mode,
      typeLabel,
      source: object.id,
      createdAt: Date.now(),
      previewUrl: mode === 'object' ? capture.previewUrl : pixelsToDataUrl(imageData),
      imageData,
      spatial: { x: point.x, y: point.y, scale: 1, rotation: 0 },
    });
    setPattern(undefined);
    setPage('create');
  }

  function pasteAsPerler() {
    if (!clipboard) return;
    setPattern(createPerlerPattern(clipboard.imageData, 20));
  }

  function returnToCapture() {
    setPage('capture');
    setPattern(undefined);
  }

  return (
    <main className="demo-stage">
      <div className="poster-copy" aria-hidden="true">
        <span>WORLD CLIPBOARD · MVP 01</span>
        <h2>把现实世界，<br />复制粘贴。</h2>
        <p>SEE · GRAB · CREATE</p>
      </div>
      <div className="phone-frame">
        {page === 'capture' || !clipboard ? (
          <CapturePage mode={mode} onModeChange={setMode} onCapture={copyObject} />
        ) : (
          <CreatePage
            item={clipboard}
            pattern={pattern}
            onBack={returnToCapture}
            onGeneratePerler={pasteAsPerler}
          />
        )}
      </div>
      <p className="demo-note">交互原型 · 浏览器内模拟小程序</p>
    </main>
  );
}
