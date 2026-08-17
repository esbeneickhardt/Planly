import type { Product } from '../../../types';

interface Props {
  items: Product[];
  activeProductId?: string;
  highlightIdx: number;
  nextIdx: () => number;
  onSelect: (product: Product) => void;
}

export default function ProjectsSection({ items, activeProductId, highlightIdx, nextIdx, onSelect }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="py-1">
      <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
        Projects
      </div>
      {items.map((product) => {
        const i = nextIdx();
        const isHighlighted = highlightIdx === i;
        const isActive = product.id === activeProductId;
        return (
          <button
            key={product.id}
            data-idx={i}
            onClick={() => onSelect(product)}
            className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
            style={{
              background: isHighlighted ? 'var(--brand-subtle)' : 'transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = isHighlighted ? 'var(--brand-subtle)' : 'transparent')
            }
          >
            <span className="text-base flex-shrink-0 mt-0.5">{product.emoji ?? '🎯'}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                  {product.name}
                </span>
                {isActive && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                    style={{
                      background: 'var(--brand-subtle)',
                      color: 'var(--brand)',
                    }}
                  >
                    Active
                  </span>
                )}
              </span>
              {product.description?.trim() ? (
                <span
                  className="text-xs block mt-0.5 overflow-hidden"
                  style={{
                    color: 'var(--text-2)',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                  }}
                >
                  {product.description
                    .replace(/#{1,6}\s|[*_`[\]()]/g, '')
                    .trim()
                    .slice(0, 200)}
                </span>
              ) : (
                <span className="text-xs block mt-0.5 italic" style={{ color: 'var(--text-3)' }}>
                  No description set
                </span>
              )}
            </span>
            <span className="text-xs flex-shrink-0 mt-0.5" style={{ color: 'var(--text-3)' }}>
              →
            </span>
          </button>
        );
      })}
    </div>
  );
}
