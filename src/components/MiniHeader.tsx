type MiniHeaderProps = {
  dark?: boolean;
  onBack?: () => void;
};

export function MiniHeader({ dark = false, onBack }: MiniHeaderProps) {
  return (
    <header className={`mini-header${dark ? ' is-dark' : ''}`}>
      <div className="mini-title">
        {onBack && (
          <button type="button" className="back-button" onClick={onBack} aria-label="返回捕捉页">
            ←
          </button>
        )}
        <div>
          <strong>世界粘贴板</strong>
          <span>World Clipboard</span>
        </div>
      </div>
      <div className="mini-capsule" aria-label="小程序菜单">
        <span aria-hidden="true">•••</span>
        <i aria-hidden="true" />
      </div>
    </header>
  );
}
