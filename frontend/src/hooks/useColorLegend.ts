import { useState, useCallback } from 'react';

const PRESET_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
const DEFAULT_NAMES: Record<string, string> = {
  '#7c3aed': 'Feature',
  '#3b82f6': 'Bug',
  '#10b981': 'Enhancement',
  '#f59e0b': 'Milestone',
  '#ef4444': 'Blocker',
  '#ec4899': 'Design',
  '#06b6d4': 'Infrastructure',
  '#f97316': 'Research',
};

export type ColorLegend = Record<string, string>;

export function useColorLegend(productId: string) {
  const key = `planly-colors-${productId}`;
  const enabledKey = `planly-colors-enabled-${productId}`;

  const [legend, setLegend] = useState<ColorLegend>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : DEFAULT_NAMES;
    } catch {
      return DEFAULT_NAMES;
    }
  });

  const [enabled, setEnabled] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(enabledKey);
      return saved ? new Set(JSON.parse(saved)) : new Set(PRESET_COLORS);
    } catch {
      return new Set(PRESET_COLORS);
    }
  });

  const update = useCallback((color: string, name: string) => {
    setLegend((prev) => {
      const next = { ...prev, [color]: name };
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  const toggleEnabled = useCallback((color: string) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color); else next.add(color);
      localStorage.setItem(enabledKey, JSON.stringify([...next]));
      return next;
    });
  }, [enabledKey]);

  const enabledColors = PRESET_COLORS.filter((c) => enabled.has(c));

  return { legend, update, toggleEnabled, colors: PRESET_COLORS, enabledColors };
}
