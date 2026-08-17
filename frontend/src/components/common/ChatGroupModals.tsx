/**
 * ChatPanel's two group-management modals: "New group" (pick participants + optional name) and
 * "Manage group" (rename, add/remove participants, leave). Rendered by ChatPanel itself rather
 * than by ChatGroupsTab, unconditionally alongside it (not nested inside the `tab === 'groups'`
 * branch) - so an open modal isn't unmounted if `tab` were ever to change underneath it. Both
 * modals share the same roster (`groupRoster`): every other project team member normally, or every
 * platform user in admin chat.
 */
import React from 'react';
import { displayName } from '../../api/client';
import type { ConversationSummary } from '../../api/client';
import Modal from './Modal';
import { groupTitle } from './ChatGroupsTab';

interface RosterMember {
  id: string;
  username: string;
  realName?: string | null;
  avatarEmoji?: string | null;
}

interface Props {
  isAdminChat: boolean;
  groupRoster: () => RosterMember[];

  showNewGroupModal: boolean;
  onCloseNewGroupModal: () => void;
  newGroupName: string;
  setNewGroupName: (v: string) => void;
  newGroupSearch: string;
  setNewGroupSearch: (v: string) => void;
  newGroupSelected: Set<string>;
  setNewGroupSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  creatingGroup: boolean;
  setCreatingGroup: (v: boolean) => void;
  createGroup: (participantIds: string[], name?: string) => Promise<string>;

  showManageGroupModal: boolean;
  onCloseManageGroupModal: () => void;
  activeGroupId: string | null;
  groupConversations: ConversationSummary[];
  manageGroupName: string;
  setManageGroupName: (v: string) => void;
  groupBusy: boolean;
  setGroupBusy: (v: boolean) => void;
  renameGroup: (id: string, name: string) => Promise<void>;
  removeGroupParticipant: (id: string, userId: string, selfUserId: string) => Promise<void>;
  addGroupParticipants: (id: string, userIds: string[]) => Promise<void>;
  addPeopleSearch: string;
  setAddPeopleSearch: (v: string) => void;
  addPeopleSelected: Set<string>;
  setAddPeopleSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  currentUserId: string;
  confirm: (message: string) => Promise<boolean>;
}

export default function ChatGroupModals({
  isAdminChat,
  groupRoster,
  showNewGroupModal,
  onCloseNewGroupModal,
  newGroupName,
  setNewGroupName,
  newGroupSearch,
  setNewGroupSearch,
  newGroupSelected,
  setNewGroupSelected,
  creatingGroup,
  setCreatingGroup,
  createGroup,
  showManageGroupModal,
  onCloseManageGroupModal,
  activeGroupId,
  groupConversations,
  manageGroupName,
  setManageGroupName,
  groupBusy,
  setGroupBusy,
  renameGroup,
  removeGroupParticipant,
  addGroupParticipants,
  addPeopleSearch,
  setAddPeopleSearch,
  addPeopleSelected,
  setAddPeopleSelected,
  currentUserId,
  confirm,
}: Props) {
  return (
    <>
      {/* New group creation */}
      {showNewGroupModal && (
        <Modal title="New group" onClose={onCloseNewGroupModal} width="max-w-sm" mobileFullscreen>
          <div className="space-y-3">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name (optional)"
              className="input text-sm w-full"
            />
            <input
              type="text"
              value={newGroupSearch}
              onChange={(e) => setNewGroupSearch(e.target.value)}
              placeholder={isAdminChat ? 'Search users…' : 'Search members…'}
              className="input text-sm w-full"
            />
            {groupRoster().length > 0 && (
              <button
                onClick={() => {
                  const visible = groupRoster().filter((m) => {
                    const q = newGroupSearch.toLowerCase().trim();
                    if (!q) return true;
                    return m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q);
                  });
                  const allSelected = visible.every((m) => newGroupSelected.has(m.id));
                  setNewGroupSelected(allSelected ? new Set() : new Set(visible.map((m) => m.id)));
                }}
                className="text-xs font-medium"
                style={{ color: 'var(--brand)' }}
              >
                {groupRoster().every((m) => newGroupSelected.has(m.id)) ? 'Deselect all' : 'Select all'}
              </button>
            )}
            <div className="max-h-64 overflow-y-auto space-y-0.5">
              {groupRoster()
                .filter((m) => {
                  const q = newGroupSearch.toLowerCase().trim();
                  if (!q) return true;
                  return m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q);
                })
                .map((m) => {
                  const checked = newGroupSelected.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors"
                      style={{ background: checked ? 'var(--brand-subtle)' : 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setNewGroupSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                        style={{ accentColor: 'var(--brand)' }}
                      />
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}
                      >
                        {m.avatarEmoji ?? m.username[0]?.toUpperCase()}
                      </div>
                      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                        {m.realName || m.username}
                      </span>
                    </label>
                  );
                })}
              {groupRoster().length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-3)' }}>
                  No one else to add.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {newGroupSelected.size} selected
              </span>
              <button
                disabled={newGroupSelected.size < 2 || creatingGroup}
                onClick={async () => {
                  setCreatingGroup(true);
                  try {
                    await createGroup(Array.from(newGroupSelected), newGroupName.trim() || undefined);
                    onCloseNewGroupModal();
                  } catch (err) {
                    alert((err as Error).message ?? 'Failed to create group');
                  } finally {
                    setCreatingGroup(false);
                  }
                }}
                className="btn-primary text-xs px-4"
              >
                {creatingGroup ? '…' : 'Create'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Manage group: rename, add/remove participants, leave */}
      {showManageGroupModal &&
        activeGroupId &&
        (() => {
          const conv = groupConversations.find((c) => c.id === activeGroupId);
          if (!conv) return null;
          return (
            <Modal title="Manage group" onClose={onCloseManageGroupModal} width="max-w-sm" mobileFullscreen>
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="chat-manage-group-name">
                    Group name
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="chat-manage-group-name"
                      type="text"
                      value={manageGroupName}
                      onChange={(e) => setManageGroupName(e.target.value)}
                      placeholder={groupTitle(conv)}
                      className="input text-sm flex-1"
                    />
                    <button
                      disabled={!manageGroupName.trim() || groupBusy}
                      onClick={async () => {
                        setGroupBusy(true);
                        try {
                          await renameGroup(activeGroupId, manageGroupName.trim());
                        } catch (err) {
                          alert((err as Error).message ?? 'Failed to rename');
                        } finally {
                          setGroupBusy(false);
                        }
                      }}
                      className="btn-secondary text-xs px-3 flex-shrink-0"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-3)' }}>
                    Participants
                  </p>
                  <div className="space-y-1">
                    {conv.participants.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--surface-2)' }}
                      >
                        <span className="text-xs flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                          {displayName(p)}
                        </span>
                        <button
                          disabled={groupBusy}
                          onClick={async () => {
                            setGroupBusy(true);
                            try {
                              await removeGroupParticipant(activeGroupId, p.id, currentUserId);
                            } catch (err) {
                              alert((err as Error).message ?? 'Failed to remove');
                            } finally {
                              setGroupBusy(false);
                            }
                          }}
                          className="text-xs opacity-60 hover:opacity-100 flex-shrink-0"
                          style={{ color: '#ef4444' }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Add people
                    </p>
                    {(() => {
                      const addable = groupRoster().filter((m) => !conv.participants.some((p) => p.id === m.id));
                      if (addable.length === 0) return null;
                      const allSelected = addable.every((m) => addPeopleSelected.has(m.id));
                      return (
                        <button
                          onClick={() =>
                            setAddPeopleSelected(allSelected ? new Set() : new Set(addable.map((m) => m.id)))
                          }
                          className="text-xs font-medium"
                          style={{ color: 'var(--brand)' }}
                        >
                          {allSelected ? 'Deselect all' : 'Select all'}
                        </button>
                      );
                    })()}
                  </div>
                  <input
                    type="text"
                    value={addPeopleSearch}
                    onChange={(e) => setAddPeopleSearch(e.target.value)}
                    placeholder="Search…"
                    className="input text-sm w-full mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {groupRoster()
                      .filter((m) => !conv.participants.some((p) => p.id === m.id))
                      .filter((m) => {
                        const q = addPeopleSearch.toLowerCase().trim();
                        if (!q) return true;
                        return m.username.toLowerCase().includes(q) || (m.realName ?? '').toLowerCase().includes(q);
                      })
                      .map((m) => {
                        const checked = addPeopleSelected.has(m.id);
                        return (
                          <label
                            key={m.id}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer"
                            style={{ background: checked ? 'var(--brand-subtle)' : 'transparent' }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setAddPeopleSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(m.id)) next.delete(m.id);
                                  else next.add(m.id);
                                  return next;
                                })
                              }
                              style={{ accentColor: 'var(--brand)' }}
                            />
                            <span className="text-xs" style={{ color: 'var(--text)' }}>
                              {m.realName || m.username}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                  <button
                    disabled={addPeopleSelected.size === 0 || groupBusy}
                    onClick={async () => {
                      setGroupBusy(true);
                      try {
                        await addGroupParticipants(activeGroupId, Array.from(addPeopleSelected));
                        setAddPeopleSelected(new Set());
                        setAddPeopleSearch('');
                      } catch (err) {
                        alert((err as Error).message ?? 'Failed to add');
                      } finally {
                        setGroupBusy(false);
                      }
                    }}
                    className="btn-primary text-xs px-4 mt-2"
                  >
                    Add selected
                  </button>
                </div>

                <button
                  disabled={groupBusy}
                  onClick={async () => {
                    if (!(await confirm('Leave this group?'))) return;
                    setGroupBusy(true);
                    try {
                      await removeGroupParticipant(activeGroupId, currentUserId, currentUserId);
                      onCloseManageGroupModal();
                    } catch (err) {
                      alert((err as Error).message ?? 'Failed to leave');
                    } finally {
                      setGroupBusy(false);
                    }
                  }}
                  className="btn-danger w-full justify-center flex text-sm"
                >
                  Leave group
                </button>
              </div>
            </Modal>
          );
        })()}
    </>
  );
}
