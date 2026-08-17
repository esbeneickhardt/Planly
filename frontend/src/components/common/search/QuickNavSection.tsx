/** Shown only when the search query is empty - a fixed set of shortcut destinations. */
interface QuickNavItem {
  label: string;
  path: string;
}

interface Props {
  items: QuickNavItem[];
  highlightIdx: number;
  nextIdx: () => number;
  onGoToView: (path: string) => void;
}

export default function QuickNavSection({ items, highlightIdx, nextIdx, onGoToView }: Props) {
  return (
    <div className="py-1.5">
      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Navigate
      </div>
      {items.map((item) => {
        const i = nextIdx();
        const isHighlighted = highlightIdx === i;
        return (
          <button
            key={item.path}
            data-idx={i}
            onClick={() => onGoToView(item.path)}
            className="w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors"
            style={{
              background: isHighlighted ? 'var(--brand-subtle)' : 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
            }
          >
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
