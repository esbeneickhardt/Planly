/**
 * Settings General (Project) tab allowing managers to edit the project name, emoji, and description,
 * and giving the owner additional controls: toggling the Analytics tab visibility, exporting the
 * project as JSON, and transferring ownership to another team member.
 * Name/emoji/description autosave together as one debounced update (~800ms after the last edit)
 * instead of requiring an explicit "Save" click.
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import type { Product, TeamMember, User } from '../../types';
import EmojiPicker from '../../components/common/EmojiPicker';
import MarkdownEditor, { type MarkdownEditorHandle } from '../../components/common/MarkdownEditor';
import SaveStatus from '../../components/common/SaveStatus';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback';

type ProjectFields = { name: string; emoji: string; description: string };

interface Props {
  activeProduct: Product;
  isOwner: boolean;
  canManage: boolean;
  currentUser: User | null;
  members: TeamMember[];
  refreshProducts: () => Promise<void>;
  setActiveProduct: (p: Product) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
  confirm: (msg: string) => Promise<boolean>;
}

export default function SettingsGeneral({
  activeProduct,
  isOwner,
  canManage,
  currentUser,
  members,
  refreshProducts,
  setActiveProduct,
  showToast,
  confirm,
}: Props) {
  const [projName, setProjName] = useState(activeProduct.name);
  const [projEmoji, setProjEmoji] = useState(activeProduct.emoji ?? '');
  const [projDesc, setProjDesc] = useState(activeProduct.description ?? '');
  const [savingProj, setSavingProj] = useState(false);
  const [justSavedProj, setJustSavedProj] = useState(false);
  const descEditorRef = useRef<MarkdownEditorHandle>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [togglingAnalytics, setTogglingAnalytics] = useState(false);
  const [togglingDiscoverable, setTogglingDiscoverable] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Debounced autosave (800ms after the last edit) - see scheduleSave's 4 call sites below.
  // saveProjectDetails is defined further down; referencing it here is fine since this wrapper is
  // only ever called later (after the full render), not during this render itself.
  const [scheduleSave, cancelScheduledSave] = useDebouncedCallback(
    (next: ProjectFields) => saveProjectDetails(next),
    800,
  );
  // "Just saved" checkmark auto-hides after 2s - same debounce mechanics as the save itself, so a
  // second save shortly after the first restarts the 2s window instead of stacking a duplicate hide.
  const [scheduleHideIndicator] = useDebouncedCallback(() => setJustSavedProj(false), 2000);

  // Reset local form state when the active product changes so stale values don't leak across
  // products, and drop any pending debounced save from the product we just navigated away from.
  useEffect(() => {
    setProjName(activeProduct.name);
    setProjEmoji(activeProduct.emoji ?? '');
    setProjDesc(activeProduct.description ?? '');
    cancelScheduledSave();
    setSavingProj(false);
    setJustSavedProj(false);
    // activeProduct.name/emoji/description intentionally omitted: this effect exists to reset the
    // form when SWITCHING products (id change), not when the current product's fields update (e.g.
    // this same save flow calling refreshProducts()). Including them would overwrite in-progress
    // edits whenever the active product's data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProduct.id, cancelScheduledSave]);

  async function toggleAnalytics() {
    setTogglingAnalytics(true);
    try {
      await api.products.update(activeProduct.id, {
        analyticsEnabled: !activeProduct.analyticsEnabled,
      });
      await refreshProducts();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setTogglingAnalytics(false);
    }
  }

  async function toggleDiscoverable() {
    setTogglingDiscoverable(true);
    try {
      await api.products.update(activeProduct.id, {
        discoverable: !activeProduct.discoverable,
      });
      await refreshProducts();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setTogglingDiscoverable(false);
    }
  }

  async function saveProjectDetails(next: ProjectFields) {
    if (!next.name.trim()) return;
    cancelScheduledSave();
    setSavingProj(true);
    try {
      await api.products.update(activeProduct.id, {
        name: next.name.trim(),
        emoji: next.emoji || undefined,
        description: next.description || undefined,
      });
      await refreshProducts();
      setJustSavedProj(true);
      scheduleHideIndicator();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSavingProj(false);
    }
  }

  // Keep refs to the latest field values and save function so Cmd/Ctrl+Enter can flush a save
  // immediately without re-subscribing the keydown listener (and without an exhaustive-deps
  // warning on a function that's recreated every render).
  const latestFieldsRef = useRef<ProjectFields>({
    name: projName,
    emoji: projEmoji,
    description: projDesc,
  });
  const saveRef = useRef(saveProjectDetails);
  useEffect(() => {
    latestFieldsRef.current = {
      name: projName,
      emoji: projEmoji,
      description: projDesc,
    };
    saveRef.current = saveProjectDetails;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canManage) {
        e.preventDefault();
        saveRef.current(latestFieldsRef.current);
        descEditorRef.current?.goToPreview();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canManage]);

  async function duplicateProject() {
    if (
      !(await confirm(
        `Create a copy of "${activeProduct.name}"? The new project keeps its tasks and canvas layout, but starts with no members, sub-plans, or integrations, and deadlines shifted into the future.`,
      ))
    )
      return;
    setDuplicating(true);
    try {
      const copy = await api.products.duplicate(activeProduct.id);
      await refreshProducts();
      setActiveProduct(copy);
      showToast(`Created "${copy.name}" - switched to the new copy`, 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setDuplicating(false);
    }
  }

  async function transferOwnership() {
    if (!transferTo) return;
    if (!(await confirm(`Transfer ownership of "${activeProduct.name}"? You will become a regular member.`))) return;
    setTransferring(true);
    try {
      await api.products.update(activeProduct.id, { ownerId: transferTo });
      await refreshProducts();
      showToast('Ownership transferred', 'success');
      setTransferTo('');
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Project details */}
      {canManage && (
        <div>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Project details
          </h2>
          <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
            Change the project name, icon, and description.
          </p>
          <div className="space-y-3">
            <div className="flex gap-2 items-start">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((v) => !v)}
                className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors flex-shrink-0"
                style={{
                  background: showEmojiPicker ? 'var(--brand-subtle)' : 'var(--surface-2)',
                  border: `1px solid ${showEmojiPicker ? 'var(--brand)' : 'var(--border)'}`,
                }}
                title="Pick an icon"
              >
                {projEmoji || '🎯'}
              </button>
              <input
                className="input text-sm flex-1"
                value={projName}
                onChange={(e) => {
                  setProjName(e.target.value);
                  scheduleSave({
                    name: e.target.value,
                    emoji: projEmoji,
                    description: projDesc,
                  });
                }}
                placeholder="Project name"
              />
            </div>
            {showEmojiPicker && (
              <div>
                <EmojiPicker
                  value={projEmoji}
                  onChange={(e) => {
                    setProjEmoji(e);
                    setShowEmojiPicker(false);
                    scheduleSave({
                      name: projName,
                      emoji: e,
                      description: projDesc,
                    });
                  }}
                />
                {projEmoji && (
                  <button
                    type="button"
                    onClick={() => {
                      setProjEmoji('');
                      setShowEmojiPicker(false);
                      scheduleSave({
                        name: projName,
                        emoji: '',
                        description: projDesc,
                      });
                    }}
                    className="mt-1 w-full text-xs py-1 rounded-lg transition-colors"
                    style={{
                      color: 'var(--text-3)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    Remove icon
                  </button>
                )}
              </div>
            )}
            <MarkdownEditor
              ref={descEditorRef}
              value={projDesc}
              onChange={(v) => {
                setProjDesc(v);
                scheduleSave({
                  name: projName,
                  emoji: projEmoji,
                  description: v,
                });
              }}
              rows={6}
              placeholder="Describe the project… (markdown supported, images can be pasted or attached)"
              initialPreview
            />
            <SaveStatus saving={savingProj} saved={justSavedProj} />
          </div>
        </div>
      )}

      {/* Owner-only sections */}
      {isOwner && (
        <>
          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Analytics
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              When enabled, all team members can see the Analytics tab. Disable it if your team prefers to work without
              visible metrics.
            </p>
            <button
              onClick={toggleAnalytics}
              disabled={togglingAnalytics}
              className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeProduct.analyticsEnabled ? 'rgba(16,185,129,0.12)' : 'var(--surface-2)',
                color: activeProduct.analyticsEnabled ? '#10b981' : 'var(--text-3)',
                border: `1px solid ${activeProduct.analyticsEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              }}
            >
              <span>{activeProduct.analyticsEnabled ? '✓' : '○'}</span>
              {togglingAnalytics
                ? 'Saving…'
                : activeProduct.analyticsEnabled
                  ? 'Analytics enabled (visible to all members)'
                  : 'Analytics disabled (hidden from team)'}
            </button>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Project search visibility
            </h2>
            <p className="text-xs mb-3" style={{ color: 'var(--text-3)' }}>
              When on, other users can find this project in "Find projects" and request access. Turn it off to keep this
              project invisible to search - existing members are unaffected either way.
            </p>
            <button
              onClick={toggleDiscoverable}
              disabled={togglingDiscoverable}
              className="flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-medium transition-all"
              style={{
                background: activeProduct.discoverable ? 'rgba(16,185,129,0.12)' : 'var(--surface-2)',
                color: activeProduct.discoverable ? '#10b981' : 'var(--text-3)',
                border: `1px solid ${activeProduct.discoverable ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              }}
            >
              <span>{activeProduct.discoverable ? '✓' : '○'}</span>
              {togglingDiscoverable
                ? 'Saving…'
                : activeProduct.discoverable
                  ? 'Visible in project search'
                  : 'Hidden from project search'}
            </button>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Duplicate project
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Create a fresh copy of this project's tasks, dependencies, and canvas layout in a brand new project - no
              members, sub-plans, or integrations carried over, and every deadline shifted into the future.
            </p>
            <button
              onClick={duplicateProject}
              disabled={duplicating}
              className="btn-secondary text-sm inline-flex items-center gap-2"
            >
              <span>⧉</span> {duplicating ? 'Duplicating…' : 'Duplicate project'}
            </button>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Export project data
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Download a complete JSON export of this project including all tasks, sprints, messages, and settings.
            </p>
            <a
              href={api.export.product(activeProduct.id)}
              download
              className="btn-secondary text-sm inline-flex items-center gap-2"
              style={{ textDecoration: 'none' }}
            >
              <span>⬇</span> Export as JSON
            </a>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
              Transfer ownership
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-3)' }}>
              Hand over ownership to another team member. You will become a regular member after this action.
            </p>
            <div className="flex gap-3 items-center">
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
                className="input text-sm flex-1 max-w-xs"
              >
                <option value="">Select new owner…</option>
                {members
                  .filter(({ userId }) => userId !== currentUser?.id)
                  .map(({ userId, user }) => (
                    <option key={userId} value={userId}>
                      {user.avatarEmoji} {user.username}
                    </option>
                  ))}
              </select>
              <button
                onClick={transferOwnership}
                disabled={!transferTo || transferring}
                className="btn-secondary text-sm"
                style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
              >
                {transferring ? 'Transferring…' : 'Transfer'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
