/**
 * Small tinted status/level pill - the single shared implementation for a pattern that was
 * previously hand-rolled with drifting background/border opacity values across many files
 * (Write/Read/None badges, verified/not-verified, overdue/on-time, login status, etc.).
 * Fixed at background 12% / border 30% opacity per tone so the same semantic color always
 * reads the same way everywhere it appears.
 */
import type { ReactNode } from 'react';

export type StatusPillTone = 'success' | 'warning' | 'danger' | 'brand' | 'neutral';

const TONE_HEX: Record<'success' | 'warning' | 'danger', string> = {
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

function tint(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface Props {
  tone: StatusPillTone;
  /** sm = compact table-cell badge, md (default) = standalone section-level pill, pill = fully
   * rounded badge (e.g. a deadline/status chip next to a page title) */
  size?: 'sm' | 'md' | 'pill';
  title?: string;
  /** Extra classes merged in on top of the size preset, e.g. `whitespace-nowrap` */
  className?: string;
  children: ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<Props['size']>, string> = {
  sm: 'inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium',
  md: 'inline-flex items-center text-xs px-2 py-1 rounded-lg font-medium',
  pill: 'inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium',
};

export default function StatusPill({ tone, size = 'md', title, className, children }: Props) {
  const style =
    tone === 'brand'
      ? {
          background: 'var(--brand-subtle)',
          color: 'var(--brand)',
          border: '1px solid var(--brand)',
        }
      : tone === 'neutral'
        ? {
            background: 'var(--surface-2)',
            color: 'var(--text-3)',
            border: '1px solid var(--border)',
          }
        : {
            background: tint(TONE_HEX[tone], 0.12),
            color: TONE_HEX[tone],
            border: `1px solid ${tint(TONE_HEX[tone], 0.3)}`,
          };
  return (
    <span title={title} className={`${SIZE_CLASSES[size]}${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </span>
  );
}
