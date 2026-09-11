export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">WC</div>
        <div>
          <h1>World Clipboard</h1>
          <p>Look. Pinch. Copy. Paste.</p>
        </div>
        <span className="status-pill">Demo mode</span>
      </header>

      <section className="empty-stage" aria-label="摄像头演示区域">
        <p className="eyebrow">SPATIAL CLIPBOARD</p>
        <h2>用手指复制现实世界</h2>
        <p>摄像头、手势识别和拼豆生成将在这里组成一个完整闭环。</p>
      </section>
    </main>
  );
}

