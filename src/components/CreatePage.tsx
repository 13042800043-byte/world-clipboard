import type { CSSProperties } from 'react';
import type { PerlerPattern } from '../lib/perler';
import type { WorldClipboardItem } from '../types';
import { MiniHeader } from './MiniHeader';

type CreatePageProps = {
  item: WorldClipboardItem;
  pattern?: PerlerPattern;
  onBack: () => void;
  onGeneratePerler: () => void;
};

const TEMPLATES = [
  { id: 'perler', icon: '▦', label: '拼豆模板', available: true },
  { id: 'sticker', icon: '◒', label: '贴纸', available: false },
  { id: 'pixel', icon: '▥', label: '像素画', available: false },
  { id: 'lego', icon: '▣', label: 'LEGO 模板', available: false },
  { id: 'cross', icon: '╳', label: '十字绣模板', available: false },
] as const;

export function CreatePage({ item, pattern, onBack, onGeneratePerler }: CreatePageProps) {
  return (
    <section className="mini-page create-page" aria-labelledby="create-title">
      <MiniHeader onBack={onBack} />
      <main className="create-scroll">
        <h1 id="create-title" className="sr-only">转换创作</h1>
        <section className="captured-hero" aria-label="已抓取对象">
          <div className={`object-aura is-${item.type}`}>
            <img src={item.previewUrl} alt={item.label} />
          </div>
          <span className="captured-badge">✓ 已抓取</span>
          <h2>{item.label}</h2>
          <p>{item.typeLabel} · 透明背景 · 已存入 World Clipboard</p>
        </section>

        <section className="template-section" aria-labelledby="template-title">
          <div className="section-heading">
            <div>
              <span>PASTE TARGETS</span>
              <h2 id="template-title">转换为创意模板</h2>
            </div>
            <em>1 / 5 可用</em>
          </div>

          <div className="template-grid">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className={template.available ? 'template-card is-ready' : 'template-card'}
                disabled={!template.available}
                aria-label={template.available ? '生成拼豆模板' : `${template.label}即将开放`}
                onClick={template.available ? onGeneratePerler : undefined}
              >
                <span className={`template-icon is-${template.id}`} aria-hidden="true">{template.icon}</span>
                <strong>{template.label}</strong>
                <small>{template.available ? '立即生成' : '即将开放'}</small>
              </button>
            ))}
          </div>
        </section>

        {pattern && <PerlerSheet pattern={pattern} />}
      </main>
    </section>
  );
}

function PerlerSheet({ pattern }: { pattern: PerlerPattern }) {
  const colors = Object.entries(pattern.counts)
    .map(([id, count]) => {
      const color = pattern.cells.find((cell) => cell?.id === id);
      return color ? { color, count } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => right.count - left.count);

  return (
    <section className="perler-sheet" aria-labelledby="perler-title">
      <div className="section-heading">
        <div>
          <span>READY TO MAKE</span>
          <h2 id="perler-title">拼豆图纸</h2>
        </div>
        <em>{pattern.size} × {pattern.size}</em>
      </div>
      <div className="perler-layout">
        <div
          className="mini-bead-grid"
          style={{ '--grid-size': pattern.size } as CSSProperties}
          aria-label={`${pattern.size}乘${pattern.size}拼豆图纸`}
        >
          {pattern.cells.map((cell, index) => (
            <span
              key={index}
              className={cell ? 'mini-bead' : 'mini-bead is-empty'}
              style={cell ? { backgroundColor: cell.hex } : undefined}
            />
          ))}
        </div>
        <div className="color-summary">
          <strong>颜色用量</strong>
          <p>总计 {pattern.totalBeads} 颗</p>
          <div>
            {colors.slice(0, 6).map(({ color, count }) => (
              <span key={color.id}>
                <i style={{ backgroundColor: color.hex }} aria-hidden="true" />
                {color.id}<b>{count}</b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
