import Modal from './Modal';
import { THEMES, useTheme, type MobileNavPosition } from '../../context/ThemeContext';

export default function ThemePickerModal({ onClose }: { onClose: () => void }) {
  const { themeId, setTheme, mobileNavPosition, setMobileNavPosition } = useTheme();

  return (
    <Modal title="Appearance" onClose={onClose} width="max-w-md" mobileFullscreen>
      <div className="grid grid-cols-3 gap-3">
        {THEMES.map((t) => {
          const active = themeId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                onClose();
              }}
              className="flex flex-col gap-2 p-3 rounded-xl text-left transition-all"
              style={{
                background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.borderColor = 'var(--border-2)';
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* Color swatch */}
              <div className="w-full h-10 rounded-lg overflow-hidden flex-shrink-0 flex">
                <div className="flex-1" style={{ background: t.swatch.bg }} />
                <div className="flex-1" style={{ background: t.swatch.surface }} />
                <div className="w-3" style={{ background: t.swatch.brand }} />
              </div>
              <div className="flex items-center justify-between w-full">
                <span
                  className="text-xs font-medium leading-tight"
                  style={{ color: active ? 'var(--brand)' : 'var(--text)' }}
                >
                  {t.label}
                </span>
                {active && (
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--brand)' }}
                  >
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <polyline
                        points="2,6 5,9 10,3"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 pt-5 md:hidden" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--text-3)' }}>
          Mobile nav position
        </p>
        <div className="flex gap-2">
          {(['top', 'bottom'] as MobileNavPosition[]).map((pos) => {
            const active = mobileNavPosition === pos;
            return (
              <button
                key={pos}
                onClick={() => setMobileNavPosition(pos)}
                className="flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all"
                style={{
                  background: active ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  border: `2px solid ${active ? 'var(--brand)' : 'var(--border)'}`,
                  color: active ? 'var(--brand)' : 'var(--text)',
                }}
              >
                {pos}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
