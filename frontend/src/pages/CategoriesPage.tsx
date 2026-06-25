import { useColorLegend } from '../hooks/useColorLegend';
import { useProduct } from '../context/ProductContext';

export default function CategoriesPage() {
  const { activeProduct } = useProduct();
  const { legend, update: updateLegend, toggleEnabled, colors, enabledColors } = useColorLegend(activeProduct?.id ?? '');

  if (!activeProduct) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ color: 'var(--text-3)' }}>
        <div className="text-5xl opacity-30">🎨</div>
        <p className="text-sm">Select a product to configure categories</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-lg mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--text)' }}>Categories</h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-3)' }}>
          Toggle which colors are active for this product and give them a label.
        </p>
        <div className="space-y-2">
          {colors.map((color) => {
            const on = enabledColors.includes(color);
            return (
              <div
                key={color}
                className="flex items-center gap-4 px-4 py-3 rounded-xl transition-opacity"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', opacity: on ? 1 : 0.5 }}
              >
                <button
                  onClick={() => toggleEnabled(color)}
                  title={on ? 'Disable' : 'Enable'}
                  className="w-6 h-6 rounded-full flex-shrink-0 transition-all"
                  style={{
                    background: color,
                    boxShadow: on ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${color}` : 'none',
                  }}
                />
                <input
                  type="text"
                  value={legend[color] ?? ''}
                  onChange={(e) => updateLegend(color, e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: 'var(--text)' }}
                  placeholder="e.g. Bug, Feature, Design…"
                />
                <span className="text-xs flex-shrink-0" style={{ color: on ? 'var(--brand)' : 'var(--text-3)' }}>
                  {on ? 'Active' : 'Off'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-6" style={{ color: 'var(--text-3)' }}>Click a dot to toggle. Changes are saved automatically.</p>
      </div>
    </div>
  );
}
