type PasteDockProps = {
  canPaste: boolean;
  onPaste: () => void;
};

export function PasteDock({ canPaste, onPaste }: PasteDockProps) {
  return (
    <nav className="paste-dock" aria-label="粘贴目标">
      <div className="dock-label">
        <span>2</span>
        <p><strong>放进</strong>一个数字工具</p>
      </div>
      <button
        type="button"
        className="paste-target"
        aria-label="粘贴为拼豆"
        disabled={!canPaste}
        onClick={onPaste}
      >
        <span className="target-icon" aria-hidden="true">▦</span>
        <span>
          <strong>Perler</strong>
          拼豆生成器
        </span>
        <em>{canPaste ? 'PASTE →' : '等待复制'}</em>
      </button>
      <button type="button" className="paste-target is-ghost" disabled>
        <span className="target-icon" aria-hidden="true">◫</span>
        <span>
          <strong>Sticker</strong>
          即将支持
        </span>
        <em>LOCKED</em>
      </button>
    </nav>
  );
}
