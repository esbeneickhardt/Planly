/**
 * useColorLegend — manages the project color legend (label → color mapping).
 *
 * Loads the legend on mount and exposes helpers to add, rename, and remove entries.
 * Saves are debounced so rapid UI interactions (e.g. color picker drags) are batched.
 * PRESET_COLORS is the ordered palette shown in the color picker.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '../api/client';

export const PRESET_COLORS = ['#7c3aed','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#f97316'];
const DEFAULT_NAMES: Record<string, string> = {
  '#7c3aed': 'Feature', '#3b82f6': 'Bug', '#10b981': 'Enhancement',
  '#f59e0b': 'Milestone', '#ef4444': 'Blocker', '#ec4899': 'Design',
  '#06b6d4': 'Infrastructure', '#f97316': 'Research',
};

export type ColorLegend = Record<string, string>;

interface LegendEntry { colorKey: string; name: string; enabled: boolean; }

export function useColorLegend(productId: string) {
  const [legend, setLegend] = useState<ColorLegend>(DEFAULT_NAMES);
  const [enabledSet, setEnabledSet] = useState<Set<string>>(new Set(PRESET_COLORS));
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef({ legend: DEFAULT_NAMES, enabledSet: new Set<string>(PRESET_COLORS) });

  useEffect(() => {
    if (!productId) return;
    setLoaded(false);
    api.colorLegend.list(productId).then((entries) => {
      const leg: ColorLegend = {};
      const ena = new Set<string>();
      entries.forEach((e) => {
        leg[e.colorKey] = e.name;
        if (e.enabled) ena.add(e.colorKey);
      });
      setLegend(leg);
      setEnabledSet(ena);
      stateRef.current = { legend: leg, enabledSet: ena };
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [productId]);

  function scheduleSave(leg: ColorLegend, ena: Set<string>) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const entries: LegendEntry[] = PRESET_COLORS.map((c) => ({
        colorKey: c,
        name: leg[c] ?? DEFAULT_NAMES[c] ?? c,
        enabled: ena.has(c),
      }));
      api.colorLegend.update(productId, entries).catch(() => {});
    }, 600);
  }

  const update = useCallback((color: string, name: string) => {
    setLegend((prev) => {
      const next = { ...prev, [color]: name };
      stateRef.current.legend = next;
      scheduleSave(next, stateRef.current.enabledSet);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const toggleEnabled = useCallback((color: string) => {
    setEnabledSet((prev) => {
      const next = new Set(prev);
      if (next.has(color)) next.delete(color); else next.add(color);
      stateRef.current.enabledSet = next;
      scheduleSave(stateRef.current.legend, next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const enabledColors = PRESET_COLORS.filter((c) => enabledSet.has(c));

  return { legend, update, toggleEnabled, colors: PRESET_COLORS, enabledColors, loaded };
}
