/**
 * ReactFlow node representing a task or milestone on the canvas.
 * Visual state (border colour, background, box-shadow) is derived from status, milestone flag, sprint membership, and `CanvasContext`.
 * Sprint aura is rendered as multi-layer CSS box-shadow using per-sprint colours; `simpleMode` hides status, deadline, and assignee rows.
 */
import { memo, useContext } from 'react';
import { displayName } from '../../../api/client';
import { Handle, Position, NodeProps } from 'reactflow';
import type { Task } from '../../../types';
import { CanvasContext } from '../canvasUtils';

interface TaskNodeData extends Task {
  selectedSprintId?: string | null;
  inActiveSprint?: boolean;
  sprintColors?: string[];
  statusLabel?: string;
}

const STATUS_COLOR: Record<string, string> = {
  backlog: '#64748b',
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
  blocked: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  blocked: 'Blocked',
};

export default memo(function TaskNode({ data, selected }: NodeProps<TaskNodeData>) {
  const { showSprintAura, simpleMode } = useContext(CanvasContext);

  // Derived display flags
  const statusColor = STATUS_COLOR[data.status] ?? '#64748b';
  const isDone = data.status === 'done';
  const isBlocked = data.status === 'blocked';
  const isMilestone = !!data.deadline;
  const isOverdue = isMilestone && new Date(data.deadline!) < new Date() && !isDone;
  const sprintMode = !!data.selectedSprintId;
  const inSprint = sprintMode && !!data.inActiveSprint;

  // Sprint aura: multi-layer box-shadow, one ring per sprint the task belongs to
  const auraShadow =
    showSprintAura && data.sprintColors && data.sprintColors.length > 0
      ? data.sprintColors.map((c, i) => `0 0 ${18 + i * 8}px ${7 + i * 4}px ${c}88`).join(', ')
      : undefined;

  // Left border priority: milestone > task color > status color
  const leftBorderColor = isMilestone ? (isOverdue ? '#ef4444' : '#f59e0b') : (data.color ?? statusColor);

  const outerBorder = selected
    ? 'var(--brand)'
    : inSprint
      ? '#10b981'
      : isMilestone
        ? isOverdue
          ? 'rgba(239,68,68,0.35)'
          : 'rgba(245,158,11,0.35)'
        : isBlocked
          ? 'rgba(239,68,68,0.35)'
          : 'var(--border)';

  const bgColor = inSprint
    ? 'rgba(16,185,129,0.07)'
    : isMilestone
      ? isOverdue
        ? 'rgba(239,68,68,0.07)'
        : 'rgba(245,158,11,0.07)'
      : isDone
        ? 'var(--surface-2)'
        : 'var(--surface)';

  const boxShadow =
    auraShadow ??
    (selected
      ? '0 0 0 2px rgba(124,58,237,0.3)'
      : inSprint
        ? '0 0 0 2px rgba(16,185,129,0.25), 0 2px 8px rgba(0,0,0,0.1)'
        : isMilestone
          ? `0 2px 12px ${isOverdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.1)'}`
          : '0 2px 8px rgba(0,0,0,0.12)');

  return (
    <div
      title={inSprint ? `In sub-plan` : undefined}
      style={{
        background: bgColor,
        border: `1.5px solid ${outerBorder}`,
        borderLeft: `3px solid ${leftBorderColor}`,
        borderRadius: 10,
        width: 200,
        position: 'relative',
        opacity: !sprintMode && isDone ? 0.65 : 1,
        boxShadow,
        transition: 'box-shadow 0.15s, border-color 0.15s, background 0.15s',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ width: 12, height: 12, background: 'var(--surface)', border: '2px solid var(--brand)', left: -7 }}
      />

      {/* Sprint membership badge - shown read-only when a sprint is active */}
      {inSprint && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, pointerEvents: 'none' }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              background: '#10b981',
              border: '2px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(16,185,129,0.4)',
            }}
          >
            <span style={{ color: 'white', fontSize: 12, lineHeight: 1, fontWeight: 700 }}>✓</span>
          </div>
        </div>
      )}

      <div style={{ padding: '10px 12px', paddingRight: inSprint ? 34 : 12 }}>
        {/* Status row - hidden in simple mode */}
        {!simpleMode && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
              {data.statusLabel ?? STATUS_LABEL[data.status] ?? data.status}
            </span>
            {isMilestone && <span style={{ fontSize: 11, flexShrink: 0 }}>{isOverdue ? '⚠️' : '⭐'}</span>}
          </div>
        )}

        {/* Task name */}
        <p
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.3,
            margin: 0,
            wordBreak: 'break-word',
            textDecoration: isDone ? 'line-through' : 'none',
            opacity: isDone ? 0.7 : 1,
          }}
        >
          {data.name}
        </p>

        {/* Milestone deadline - hidden in simple mode */}
        {!simpleMode && isMilestone && (
          <p style={{ fontSize: 10, marginTop: 4, color: isOverdue ? '#ef4444' : '#d97706', fontWeight: 600 }}>
            📅 {new Date(data.deadline!).toLocaleDateString()}
          </p>
        )}

        {/* Owner + Reviewer - hidden in simple mode */}
        {!simpleMode && (data.owner || data.reviewer) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {data.owner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 12 }}>{data.owner.avatarEmoji ?? '👤'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{displayName(data.owner)}</span>
              </div>
            )}
            {data.reviewer && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }} title="Reviewer">
                <span style={{ fontSize: 10, color: 'var(--text-3)', opacity: 0.7 }}>→</span>
                <span style={{ fontSize: 12 }}>{data.reviewer.avatarEmoji ?? '👤'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', opacity: 0.8 }}>{displayName(data.reviewer)}</span>
              </div>
            )}
          </div>
        )}

        {/* Subtask progress bar */}
        {data.subtasks && data.subtasks.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(data.subtasks.filter((s) => s.completed).length / data.subtasks.length) * 100}%`,
                  background: statusColor,
                  borderRadius: 2,
                }}
              />
            </div>
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ width: 12, height: 12, background: 'var(--surface)', border: '2px solid var(--brand)', right: -7 }}
      />
    </div>
  );
});
