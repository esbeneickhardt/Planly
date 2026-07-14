/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Design token colors - backed by CSS variables so they switch across themes
        canvas:  'var(--bg)',
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        border:  { DEFAULT: 'var(--border)',  2: 'var(--border-2)' },
        token:   { DEFAULT: 'var(--text)',    2: 'var(--text-2)', 3: 'var(--text-3)' },
        accent:  { DEFAULT: 'var(--brand)',   hover: 'var(--brand-hover)', subtle: 'var(--brand-subtle)' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Inter"', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
