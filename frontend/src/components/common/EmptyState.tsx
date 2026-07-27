/**
 * Shared "nothing here yet" placeholder - previously hand-rolled with drifting icon sizes
 * (text-2xl/3xl/4xl/5xl) and gaps across many pages for conceptually identical states. The
 * outer container's own sizing (h-full for a full page, h-48 for an inline panel, py-10 for a
 * card, etc.) still varies by context, so it's passed in via `className` rather than baked in.
 */
import type { ReactNode } from 'react';

const ICON_SIZE: Record<'sm' | 'md' | 'lg', string> = { sm: 'text-3xl', md: 'text-4xl', lg: 'text-5xl' };
const GAP: Record<'sm' | 'md' | 'lg', string> = { sm: 'gap-2', md: 'gap-3', lg: 'gap-4' };

interface Props {
  icon: string;
  /** sm = nested panel, md (default) = section/table empty state, lg = full-page empty state */
  size?: 'sm' | 'md' | 'lg';
  description: string;
  action?: ReactNode;
  /** Sizing/spacing for the outer container - e.g. `h-full`, `h-48`, `py-10` */
  className?: string;
}

export default function EmptyState({ icon, size = 'md', description, action, className }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center ${GAP[size]}${className ? ` ${className}` : ''}`}
      style={{ color: 'var(--text-3)' }}
    >
      <div className={`${ICON_SIZE[size]} opacity-30`} aria-hidden="true">
        {icon}
      </div>
      <p className="text-sm">{description}</p>
      {action}
    </div>
  );
}
