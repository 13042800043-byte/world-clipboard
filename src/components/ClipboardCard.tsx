import type { WorldClipboardItem } from '../types';

export function ClipboardCard({ item }: { item?: WorldClipboardItem }) {
  return (
    <section className="clipboard-card" aria-labelledby="clipboard-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">WORLD CLIPBOARD</p>
          <h2 id="clipboard-title">当前复制对象</h2>
        </div>
        <span>{item ? '1 ITEM' : 'EMPTY'}</span>
      </div>

      {item ? (
        <div className="clipboard-object">
          <div className="clipboard-preview">
            <img src={item.previewUrl} alt={item.label} />
          </div>
          <div>
            <strong>{item.label}</strong>
            <p>透明 RGBA · 可继续处理</p>
          </div>
        </div>
      ) : (
        <div className="clipboard-empty">
          <span aria-hidden="true">⌁</span>
          <p>抓取对象后，它会出现在这里。</p>
        </div>
      )}
    </section>
  );
}

