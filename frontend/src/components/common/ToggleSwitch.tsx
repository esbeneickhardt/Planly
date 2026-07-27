/**
 * Pure visual on/off switch - no click handling of its own, wrap it in a button. Single shared
 * implementation for a pattern that was previously hand-rolled three times (this file's callers,
 * plus `pages/admin/AdminComponents.tsx`'s `Toggle`, which hardcoded `#6366f1` instead of
 * `var(--brand)` and so silently ignored the active theme's brand color).
 */
interface Props {
  checked: boolean;
}

export default function ToggleSwitch({ checked }: Props) {
  return (
    <div
      className="w-9 h-5 rounded-full flex-shrink-0 relative transition-colors"
      style={{ background: checked ? 'var(--brand)' : 'var(--border)' }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all"
        style={{ left: checked ? 'calc(100% - 18px)' : '2px' }}
      />
    </div>
  );
}
