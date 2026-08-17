/**
 * Shared, centered project identity header - emoji + name, owner, and deadline/status pills -
 * used identically across the About, Settings, and Analytics pages so all three present the same
 * project header instead of each having its own slightly different variant. Each row is
 * independently justify-center'd (not a blanket text-center on the wrapper) since these are flex
 * rows, not plain text - text-align has no effect on how a flex row's own items are positioned,
 * that's justify-content's job.
 */
import StatusPill from './StatusPill';
import { isBeforeToday } from '../../utils/dates';
import { displayName } from '../../utils/user';
import type { ProductStatus } from '../../types';

interface ProjectHeaderProps {
  emoji?: string | null;
  name: string;
  deadline: string;
  status: ProductStatus;
  owner?: {
    avatarEmoji?: string | null;
    username: string;
    realName?: string | null;
  } | null;
}

export default function ProjectHeader({ emoji, name, deadline, status, owner }: ProjectHeaderProps) {
  const deadlineDate = new Date(deadline);
  const isOverdue = isBeforeToday(deadlineDate);
  const deadlineStr = deadlineDate.toLocaleDateString([], {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center gap-4">
        {emoji && <span className="text-5xl leading-none flex-shrink-0">{emoji}</span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight" style={{ color: 'var(--text)' }}>
            {name}
          </h1>
        </div>
      </div>

      {owner && (
        <p className="text-xs text-center" style={{ color: 'var(--text-3)' }}>
          Owner:{' '}
          <span style={{ color: 'var(--text-2)' }}>
            {owner.avatarEmoji} {displayName(owner)}
          </span>
        </p>
      )}

      <div className="flex items-center justify-center gap-2 flex-wrap">
        <StatusPill tone={isOverdue ? 'danger' : 'success'} size="pill">
          {isOverdue ? 'Overdue · ' : 'Deadline · '}
          {deadlineStr}
        </StatusPill>
        {status === 'completed' && (
          <StatusPill tone="success" size="pill">
            ✓ Completed
          </StatusPill>
        )}
        {status === 'archived' && (
          <StatusPill tone="neutral" size="pill">
            📦 Archived
          </StatusPill>
        )}
      </div>
    </div>
  );
}
