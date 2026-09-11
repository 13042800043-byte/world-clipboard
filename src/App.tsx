import { useState } from 'react';
import { CameraStage } from './components/CameraStage';
import { ClipboardCard } from './components/ClipboardCard';
import { PasteDock } from './components/PasteDock';
import { PerlerPanel } from './components/PerlerPanel';
import { renderDemoObject, type DemoObject } from './lib/demoScene';
import { createPerlerPattern, type PerlerPattern } from './lib/perler';
import type { NormalizedPoint } from './lib/pinch';
import type { WorldClipboardItem } from './types';

export function App() {
  const [clipboard, setClipboard] = useState<WorldClipboardItem>();
  const [pattern, setPattern] = useState<PerlerPattern>();
  const [selectionPoint, setSelectionPoint] = useState<NormalizedPoint>();
  const [status, setStatus] = useState('Ready');

  function copyObject(object: DemoObject, point: NormalizedPoint) {
    const capture = renderDemoObject(object);
    setClipboard({
      id: `${object.id}-${Date.now()}`,
      label: object.label,
      source: object.id,
      createdAt: Date.now(),
      previewUrl: capture.previewUrl,
      imageData: capture.imageData,
    });
    setSelectionPoint(point);
    setPattern(undefined);
    setStatus('Copied');
  }

  function pasteAsPerler() {
    if (!clipboard) return;
    setPattern(createPerlerPattern(clipboard.imageData, 20));
    setStatus('Pasted');
  }

  function reset() {
    setClipboard(undefined);
    setPattern(undefined);
    setSelectionPoint(undefined);
    setStatus('Ready');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">WC</div>
        <div className="brand-copy">
          <h1>World Clipboard</h1>
          <p>Look. Pinch. Copy. Paste.</p>
        </div>
        <div className="topbar-actions">
          <span className="status-pill" role="status" aria-live="polite">
            <i aria-hidden="true" /> {status}
          </span>
          <button type="button" className="text-button" onClick={reset}>重新开始</button>
        </div>
      </header>

      <div className="workspace">
        <CameraStage onObjectSelected={copyObject} selectionPoint={selectionPoint} />
        <aside className="side-rail">
          <ClipboardCard item={clipboard} />
          <section className="concept-note">
            <p className="eyebrow">NO CHATBOX</p>
            <p>你的动作就是 Prompt。对象被复制后，数字工具决定它接下来变成什么。</p>
          </section>
        </aside>
      </div>

      <PasteDock canPaste={Boolean(clipboard)} onPaste={pasteAsPerler} />
      <PerlerPanel pattern={pattern} />
    </main>
  );
}
