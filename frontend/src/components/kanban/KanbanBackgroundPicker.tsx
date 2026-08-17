/**
 * Board background image swatch grid, shown inside KanbanFiltersBar's View menu. Selection state
 * (`bgImage`) is kept as local UI state in KanbanBoard (not global context) and persisted per
 * product to localStorage there - this component is presentation-only.
 */
import { KANBAN_BACKGROUNDS } from '../../constants/kanbanBackgrounds';

interface Props {
  bgImage: string | null;
  onSelectBg: (id: string | null) => void;
}

export default function KanbanBackgroundPicker({ bgImage, onSelectBg }: Props) {
  return (
    <div className="pt-1" style={{ borderTop: '1px solid var(--border)' }}>
      <span
        className="text-[10px] font-semibold uppercase tracking-widest px-1 block mb-1.5 mt-1"
        style={{ color: 'var(--text-3)' }}
      >
        Background
      </span>
      <div className="grid grid-cols-4 gap-1.5 px-1">
        <button
          onClick={() => onSelectBg(null)}
          title="None"
          className="h-8 rounded flex-shrink-0"
          style={{
            background: 'var(--surface-2)',
            border: `1px solid ${bgImage === null ? 'var(--brand)' : 'var(--border)'}`,
            outline: bgImage === null ? '2px solid var(--brand)' : 'none',
            outlineOffset: bgImage === null ? '1px' : '0',
          }}
        />
        {KANBAN_BACKGROUNDS.map((b) => {
          const active = bgImage === b.id;
          return (
            <button
              key={b.id}
              onClick={() => onSelectBg(b.id)}
              title={b.label}
              className="h-8 rounded flex-shrink-0"
              style={{
                background: b.gradient,
                outline: active ? '2px solid var(--brand)' : 'none',
                outlineOffset: active ? '1px' : '0',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
