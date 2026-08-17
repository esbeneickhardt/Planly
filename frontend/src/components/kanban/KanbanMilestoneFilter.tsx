/**
 * Searchable single-select milestone filter for the Kanban board - narrows the board to one
 * milestone's tasks (plus the milestone task itself) at a time. Scales to many milestones via the
 * search box, unlike a plain <select> (which is what the Sprint filter next to it still uses).
 */
import { useEffect, useRef, useState } from 'react';

export interface MilestoneOption {
  id: string;
  name: string;
  color: string;
  count: number;
  /** Milestone task's own status is in a "done" column - shown de-emphasized and sorted last */
  done: boolean;
}

interface Props {
  milestones: MilestoneOption[];
  selectedId: string | null;
  onChange: (id: string | null) => void;
}

export default function KanbanMilestoneFilter({ milestones, selectedId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  if (milestones.length === 0) return null;

  const selected = milestones.find((m) => m.id === selectedId) ?? null;
  const filtered = search.trim()
    ? milestones.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
    : milestones;

  return (
    <div ref={ref} className="relative flex items-center gap-1.5 flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all"
        style={{
          background: selected ? 'var(--brand-subtle)' : 'var(--surface-2)',
          color: selected ? 'var(--brand)' : 'var(--text-2)',
          border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        }}
      >
        {selected && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: selected.color }} />}
        <span className="max-w-[140px] truncate">{selected ? selected.name : 'All milestones'}</span>
        <span className="text-[10px]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 rounded-lg shadow-xl z-40 overflow-hidden flex flex-col"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            width: 220,
            maxHeight: 280,
          }}
        >
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search milestones…"
            className="text-xs px-2.5 py-2 bg-transparent outline-none flex-shrink-0"
            style={{
              color: 'var(--text)',
              borderBottom: '1px solid var(--border)',
            }}
          />
          <div className="overflow-y-auto py-1">
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
                setSearch('');
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${!selectedId ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
              style={{ color: !selectedId ? 'var(--brand)' : 'var(--text)' }}
            >
              <span className="flex-1 text-left">All milestones</span>
              {!selectedId && <span style={{ color: 'var(--brand)' }}>✓</span>}
            </button>
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                No matches
              </div>
            )}
            {filtered.map((m) => {
              const active = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${active ? 'bg-[var(--brand-subtle)]' : 'hover:bg-[var(--surface-2)]'}`}
                  style={{
                    color: active ? 'var(--brand)' : 'var(--text)',
                    opacity: m.done && !active ? 0.55 : 1,
                  }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
                  <span className="flex-1 text-left truncate">{m.name}</span>
                  {m.done && (
                    <span className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                      done
                    </span>
                  )}
                  <span style={{ color: 'var(--text-3)' }}>{m.count}</span>
                  {active && <span style={{ color: 'var(--brand)' }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
