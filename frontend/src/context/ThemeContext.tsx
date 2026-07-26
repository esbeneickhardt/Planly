/**
 * Manages the active visual theme, persisting the selection to `planly-theme` in localStorage.
 * Applies the theme by setting `data-theme` on `document.documentElement` and toggling the `dark` class.
 * `THEMES` defines 11 built-in themes with swatch colours used in the theme picker UI.
 */
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeId =
  | 'dark' // Midnight
  | 'night-lair' // Night Lair
  | 'ember' // Ember
  | 'deep-sea' // Deep Sea
  | 'neon-tokyo' // Neon Tokyo
  | 'carbon' // Carbon
  | 'antique' // Antique
  | 'vice-city' // Vice City
  | 'sakura' // Sakura
  | 'arctic' // Arctic
  | 'light'; // Daylight

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  dark: boolean;
  swatch: { bg: string; surface: string; brand: string; text: string };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'dark',
    label: 'Midnight',
    dark: true,
    swatch: { bg: '#0c0c18', surface: '#131320', brand: '#8b5cf6', text: '#f0f0ff' },
  },
  {
    id: 'night-lair',
    label: 'Night Lair',
    dark: true,
    swatch: { bg: '#191920', surface: '#21222c', brand: '#bd93f9', text: '#f8f8f2' },
  },
  {
    id: 'ember',
    label: 'Ember',
    dark: true,
    swatch: { bg: '#1e1c1e', surface: '#2d2a2e', brand: '#fc9867', text: '#fcfcfa' },
  },
  {
    id: 'deep-sea',
    label: 'Deep Sea',
    dark: true,
    swatch: { bg: '#011627', surface: '#0b2942', brand: '#82aaff', text: '#d6deeb' },
  },
  {
    id: 'neon-tokyo',
    label: 'Neon Tokyo',
    dark: true,
    swatch: { bg: '#13141f', surface: '#1a1b2e', brand: '#7aa2f7', text: '#c0caf5' },
  },
  {
    id: 'carbon',
    label: 'Carbon',
    dark: true,
    swatch: { bg: '#1b2028', surface: '#222932', brand: '#61afef', text: '#abb2bf' },
  },
  {
    id: 'antique',
    label: 'Antique',
    dark: true,
    swatch: { bg: '#1d2021', surface: '#282828', brand: '#d79921', text: '#ebdbb2' },
  },
  {
    id: 'vice-city',
    label: 'Vice City',
    dark: true,
    swatch: { bg: '#0d0821', surface: '#16102e', brand: '#ff2d9a', text: '#ffd6f8' },
  },
  {
    id: 'sakura',
    label: 'Sakura',
    dark: true,
    swatch: { bg: '#0a0f10', surface: '#111a1c', brand: '#6abf88', text: '#d4ead8' },
  },
  {
    id: 'arctic',
    label: 'Arctic',
    dark: true,
    swatch: { bg: '#030508', surface: '#070e1a', brand: '#88c8f0', text: '#c8dff0' },
  },
  {
    id: 'light',
    label: 'Daylight',
    dark: false,
    swatch: { bg: '#f4f4f8', surface: '#ffffff', brand: '#7c3aed', text: '#111128' },
  },
];

export type MobileNavPosition = 'top' | 'bottom';

interface ThemeContextValue {
  themeId: ThemeId;
  isDark: boolean;
  setTheme: (id: ThemeId) => void;
  mobileNavPosition: MobileNavPosition;
  setMobileNavPosition: (pos: MobileNavPosition) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeId: 'dark',
  isDark: true,
  setTheme: () => {},
  mobileNavPosition: 'top',
  setMobileNavPosition: () => {},
});

function isValidThemeId(v: string): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // State: initialise from localStorage so the correct theme loads before first paint
  const [themeId, setThemeId] = useState<ThemeId>(() => {
    const saved = localStorage.getItem('planly-theme');
    if (saved && isValidThemeId(saved)) return saved;
    return 'dark';
  });
  // Device-scoped preference (no reason to sync across devices) for where the mobile top bar sits
  const [mobileNavPosition, setMobileNavPosition] = useState<MobileNavPosition>(() => {
    const saved = localStorage.getItem('planly-mobile-nav-position');
    return saved === 'bottom' ? 'bottom' : 'top';
  });

  // Apply theme to DOM and persist on every change
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', themeId);
    const meta = THEMES.find((t) => t.id === themeId);
    if (meta?.dark) root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('planly-theme', themeId);
  }, [themeId]);

  useEffect(() => {
    localStorage.setItem('planly-mobile-nav-position', mobileNavPosition);
  }, [mobileNavPosition]);

  const isDark = THEMES.find((t) => t.id === themeId)?.dark ?? true;

  return (
    <ThemeContext.Provider value={{ themeId, isDark, setTheme: setThemeId, mobileNavPosition, setMobileNavPosition }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
