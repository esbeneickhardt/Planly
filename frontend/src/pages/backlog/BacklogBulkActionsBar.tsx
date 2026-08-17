/**
 * The "N selected" action bar shown once one or more backlog rows are checked - assign owner,
 * assign reviewer, set status, set color, or delete, all as bulk operations. Fully self-contained:
 * owns its own popover state and the mutations themselves, since none of it is needed by
 * BacklogPage once selection is cleared.
 */
import { useState, useRef, useEffect } from 'react';
import { useProduct } from '../../context/ProductContext';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useColorLegend } from '../../hooks/useColorLegend';
import { api } from '../../api/client';
import type { Task } from '../../types';

interface Props {
  selected: Set<string>;
  onCleared: () => void;
}

const STATUS_OPTIONS = [
  { key: 'backlog', label: 'Not started', color: '#64748b' },
  { key: 'todo', label: 'To Do', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'blocked', label: 'Blocked', color: '#ef4444' },
  { key: 'done', label: 'Done', color: '#10b981' },
];

export default function BacklogBulkActionsBar({ selected, onCleared }: Props) {
  const { activeProduct, refreshTasks } = useProduct();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { legend, enabledColors } = useColorLegend(activeProduct?.id ?? '');

  const [showOwnerPicker, setShowOwnerPicker] = useState(false);
  const [showReviewerPicker, setShowReviewerPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [members, setMembers] = useState<
    { userId: string; user: { id: string; username: string; realName: string | null; avatarEmoji: string | null } }[]
  >([]);
  const [assigningOwner, setAssigningOwner] = useState(false);
  const ownerPickerRef = useRef<HTMLDivElement>(null);
  const reviewerPickerRef = useRef<HTMLDivElement>(null);
  const statusPickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Fetch members when the owner or reviewer picker opens; reset cache on product change
  useEffect(() => {
    setMembers([]);
  }, [activeProduct?.id]);
  useEffect(() => {
    if ((!showOwnerPicker && !showReviewerPicker) || !activeProduct || members.length > 0) return;
    api.products
      .getAbout(activeProduct.id)
      .then((data) => setMembers(data.members))
      .catch(() => showToast('Failed to load members - please try again', 'error'));
  }, [showOwnerPicker, showReviewerPicker, activeProduct, members.length, showToast]);

  // Close pickers on outside click
  useEffect(() => {
    if (!showOwnerPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (ownerPickerRef.current && !ownerPickerRef.current.contains(e.target as Node)) setShowOwnerPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showOwnerPicker]);
  useEffect(() => {
    if (!showReviewerPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (reviewerPickerRef.current && !reviewerPickerRef.current.contains(e.target as Node)) setShowReviewerPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showReviewerPicker]);
  useEffect(() => {
    if (!showStatusPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) setShowStatusPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showStatusPicker]);
  useEffect(() => {
    if (!showColorPicker) return;
    function onClickOutside(e: MouseEvent) {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) setShowColorPicker(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showColorPicker]);

  async function bulkDelete() {
    if (!activeProduct || !(await confirm(`Delete ${selected.size} task(s)?`))) return;
    try {
      await api.tasks.bulkDelete(activeProduct.id, Array.from(selected));
      await refreshTasks();
      onCleared();
      showToast('Tasks deleted', 'info');
    } catch {
      showToast('Failed to delete tasks - please try again', 'error');
    }
  }

  async function bulkAssignOwner(userId: string) {
    if (!activeProduct) return;
    setAssigningOwner(true);
    setShowOwnerPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { ownerId: userId });
      await refreshTasks();
      onCleared();
      showToast(`Assigned owner to ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to assign owner - please try again', 'error');
    } finally {
      setAssigningOwner(false);
    }
  }

  async function bulkAssignReviewer(userId: string) {
    if (!activeProduct) return;
    setShowReviewerPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { reviewerId: userId });
      await refreshTasks();
      onCleared();
      showToast(`Assigned reviewer to ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to assign reviewer - please try again', 'error');
    }
  }

  async function bulkSetStatus(status: string) {
    if (!activeProduct) return;
    setShowStatusPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { status: status as Task['status'] });
      await refreshTasks();
      onCleared();
      showToast(`Updated status for ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to update status - please try again', 'error');
    }
  }

  async function bulkSetColor(color: string | null) {
    if (!activeProduct) return;
    setShowColorPicker(false);
    const count = selected.size;
    try {
      await api.tasks.bulkUpdate(activeProduct.id, Array.from(selected), { color });
      await refreshTasks();
      onCleared();
      showToast(`Updated color for ${count} task${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to update color - please try again', 'error');
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs ml-2">
      <span style={{ color: 'var(--text-3)' }}>{selected.size} selected</span>
      {/* Owner picker */}
      <div ref={ownerPickerRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setShowOwnerPicker((v) => !v)}
          disabled={assigningOwner}
          className="font-medium"
          style={{ color: 'var(--brand)' }}
        >
          {assigningOwner ? 'Assigning…' : 'Assign owner ▾'}
        </button>
        {showOwnerPicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {members.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                Loading…
              </div>
            ) : (
              members.map((m) => (
                <button
                  key={m.userId}
                  onClick={() => bulkAssignOwner(m.userId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{m.user.avatarEmoji ?? '👤'}</span>
                  <span>{m.user.realName ?? m.user.username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {/* Reviewer picker */}
      <div ref={reviewerPickerRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowReviewerPicker((v) => !v)} className="font-medium" style={{ color: 'var(--brand)' }}>
          Assign reviewer ▾
        </button>
        {showReviewerPicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {members.length === 0 ? (
              <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-3)' }}>
                Loading…
              </div>
            ) : (
              members.map((m) => (
                <button
                  key={m.userId}
                  onClick={() => bulkAssignReviewer(m.userId)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: 'var(--text)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{m.user.avatarEmoji ?? '👤'}</span>
                  <span>{m.user.realName ?? m.user.username}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {/* Status picker */}
      <div ref={statusPickerRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowStatusPicker((v) => !v)} className="font-medium" style={{ color: 'var(--brand)' }}>
          Set status ▾
        </button>
        {showStatusPicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 160,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => bulkSetStatus(s.key)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left"
                style={{ color: 'var(--text)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Color picker */}
      <div ref={colorPickerRef} style={{ position: 'relative' }}>
        <button onClick={() => setShowColorPicker((v) => !v)} className="font-medium" style={{ color: 'var(--brand)' }}>
          Set color ▾
        </button>
        {showColorPicker && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 6,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              minWidth: 180,
              zIndex: 50,
              overflow: 'hidden',
            }}
          >
            <div className="flex items-center gap-2 flex-wrap p-2.5">
              {enabledColors.map((c) => (
                <button
                  key={c}
                  onClick={() => bulkSetColor(c)}
                  title={legend[c] || c}
                  className="w-6 h-6 rounded-full transition-transform"
                  style={{ background: c }}
                />
              ))}
            </div>
            <button
              onClick={() => bulkSetColor(null)}
              className="w-full text-left px-3 py-2 text-xs"
              style={{ color: 'var(--text-3)', borderTop: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Clear color
            </button>
          </div>
        )}
      </div>
      <button onClick={bulkDelete} className="font-medium" style={{ color: '#ef4444' }}>
        Delete
      </button>
    </div>
  );
}
