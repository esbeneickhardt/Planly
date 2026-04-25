import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import type { Task } from '../../../types';

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};

export default memo(function TaskNode({ data, selected }: NodeProps<Task>) {
  const statusColor = STATUS_COLOR[data.status] ?? '#64748b';

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: `1px solid ${selected ? 'var(--brand)' : 'var(--border)'}`,
        borderLeft: `3px solid ${data.color ?? statusColor}`,
        borderRadius: 10,
        width: 200,
        boxShadow: selected ? '0 0 0 2px rgba(124,58,237,0.25)' : '0 2px 8px rgba(0,0,0,0.15)',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: 'var(--brand)', border: '2px solid var(--surface)' }} />

      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          {data.deadline && (
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 600 }}>
              Milestone
            </span>
          )}
        </div>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3, margin: 0, wordBreak: 'break-word' }}>
          {data.name}
        </p>
        {data.owner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <span style={{ fontSize: 13 }}>{data.owner.avatarEmoji ?? '👤'}</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{data.owner.username}</span>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ background: 'var(--brand)', border: '2px solid var(--surface)' }} />
    </div>
  );
});
