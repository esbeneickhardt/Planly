/**
 * Settings Color Labels tab that lets managers toggle which preset colors are active for this project
 * and assign human-readable names to each color (e.g. "Bug", "Feature").
 * State is managed by useColorLegend which debounces and persists changes to the API.
 */
import { useColorLegend, PRESET_COLORS } from '../../hooks/useColorLegend';

interface Props {
  productId: string;
}

export default function SettingsColors({ productId }: Props) {
  const { legend, update: updateLegend, toggleEnabled, enabledColors } = useColorLegend(productId);

  return (
    <div className="max-w-lg">
      <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Color labels</h2>
      <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>Toggle which colors are active and give them a name for this project.</p>
      <div className="space-y-2">
        {PRESET_COLORS.map((color) => {
          const on = enabledColors.includes(color);
          return (
            <div
              key={color}
              className="flex items-center gap-4 px-4 py-3 rounded-xl transition-opacity"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', opacity: on ? 1 : 0.45 }}
            >
              <button
                onClick={() => toggleEnabled(color)}
                title={on ? 'Disable' : 'Enable'}
                className="w-6 h-6 rounded-full flex-shrink-0 transition-all"
                style={{ background: color, boxShadow: on ? `0 0 0 2px var(--surface-2), 0 0 0 3.5px ${color}` : 'none' }}
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
                {on ? 'Active' : 'Hidden'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
