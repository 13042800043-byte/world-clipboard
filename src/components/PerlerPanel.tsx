import type { CSSProperties } from 'react';
import type { PerlerPattern } from '../lib/perler';

export function PerlerPanel({ pattern }: { pattern?: PerlerPattern }) {
  if (!pattern) return null;

  const colorRows = Object.entries(pattern.counts)
    .map(([id, count]) => {
      const color = pattern.cells.find((cell) => cell?.id === id);
      return color ? { color, count } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((left, right) => right.count - left.count);

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <div className="result-copy">
        <p className="eyebrow">PASTE RESULT</p>
        <h2 id="result-title">拼豆模板</h2>
        <p>{pattern.size} × {pattern.size} 网格 · 总计 {pattern.totalBeads} 颗</p>
      </div>

      <div
        className="bead-grid"
        style={{ '--grid-size': pattern.size } as CSSProperties}
        aria-label={`${pattern.size}乘${pattern.size}拼豆模板`}
      >
        {pattern.cells.map((cell, index) => (
          <span
            key={index}
            className={cell ? 'bead-cell' : 'bead-cell is-empty'}
            style={cell ? { backgroundColor: cell.hex } : undefined}
            title={cell ? `${cell.id} ${cell.name}` : '空白'}
          />
        ))}
      </div>

      <div className="bill-of-materials">
        <h3>颜色清单</h3>
        <div>
          {colorRows.map(({ color, count }) => (
            <span key={color.id}>
              <i style={{ backgroundColor: color.hex }} aria-hidden="true" />
              {color.id}
              <strong>{count}</strong>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

