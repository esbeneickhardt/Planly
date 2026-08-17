/**
 * Small shared building blocks for the admin panel's settings pages (AdminEmail, AdminIpRules,
 * etc.): `Toggle`, a labeled optimistic on/off switch that calls an async `onChange`, and
 * `StatCard`, a plain label/value/sub tile for dashboards.
 * `Toggle`'s `pendingRef` guards against two races while a save is in flight: it ignores a second
 * click until the current one settles, and it stops the effect that syncs local state from the
 * `value` prop from clobbering the optimistic UI with a not-yet-updated parent value.
 */
import { useState, useEffect, useRef } from 'react';
import ToggleSwitch from '../../components/common/ToggleSwitch';

export function Toggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => Promise<void> | void;
}) {
  const [checked, setChecked] = useState(value);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!pendingRef.current) setChecked(value);
  }, [value]);

  async function handleClick() {
    if (pendingRef.current) return;
    const next = !checked;
    pendingRef.current = true;
    setChecked(next);
    try {
      await onChange(next);
    } catch {
      setChecked(!next);
    } finally {
      pendingRef.current = false;
    }
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors w-full"
      style={{
        background: 'var(--surface-2)',
        border: `1px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
      }}
    >
      <ToggleSwitch checked={checked} />
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {label}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
          {description}
        </p>
      </div>
    </button>
  );
}

export function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div
      className="p-5 rounded-xl flex flex-col gap-1"
      style={{
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
      }}
    >
      <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
        {value}
      </p>
      <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
        {label}
      </p>
      {sub && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}
