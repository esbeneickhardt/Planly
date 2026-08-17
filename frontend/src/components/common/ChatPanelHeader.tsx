/**
 * ChatPanel's window chrome: the desktop drag-handle header (title/breadcrumb + minimize/
 * fullscreen/close buttons) and the tab bar beneath it. Both rows double as the swipe-down-to-
 * dismiss gesture surface while the panel is expanded (mobile fullscreen or manual desktop
 * fullscreen) - see `useChatPanelLayout`'s `handleExpandedTouch*` handlers, threaded through here
 * as props rather than reimplemented, since the gesture's state (drag distance/threshold) lives
 * there alongside the rest of the panel's chrome state.
 */
import React from 'react';
import type { Message } from '../../api/client';
import type { Tab } from '../../hooks/useChatCompose';

interface Props {
  isAdminChat: boolean;
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedTask: { id: string; name: string } | null;
  setSelectedTask: (t: { id: string; name: string } | null) => void;
  isMinimized: boolean;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isExpanded: boolean;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
  inSubThread: boolean;
  unreadByTask: { general: number; byTask: Record<string, number> };
  tasksUnread: number;
  taskThreadCount: number;
  totalDmUnread: number;
  totalGroupUnread: number;
  activeConvId: string | null;
  activeGroupId: string | null;
  setSearch: (s: string) => void;
  setActiveProjectId: (id: string | null) => void;
  setProjectMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadAdminProjects: () => void;
  loadPeople: () => void;
  loadGroups: () => void;
  onExpandedTouchStart: (e: React.TouchEvent) => void;
  onExpandedTouchMove: (e: React.TouchEvent) => void;
  onExpandedTouchEnd: () => void;
  onHeaderDrag: (e: React.PointerEvent) => void;
}

function ExpandIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8,1 12,1 12,5" />
      <polyline points="5,12 1,12 1,8" />
      <line x1="12" y1="1" x2="7" y2="6" />
      <line x1="1" y1="12" x2="6" y2="7" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="12,8 12,12 8,12" />
      <polyline points="1,5 1,1 5,1" />
      <line x1="7" y1="7" x2="12" y2="12" />
      <line x1="1" y1="1" x2="6" y2="6" />
    </svg>
  );
}

export default function ChatPanelHeader({
  isAdminChat,
  tab,
  setTab,
  selectedTask,
  setSelectedTask,
  isMinimized,
  setIsMinimized,
  isExpanded,
  setIsExpanded,
  onClose,
  inSubThread,
  unreadByTask,
  tasksUnread,
  taskThreadCount,
  totalDmUnread,
  totalGroupUnread,
  activeConvId,
  activeGroupId,
  setSearch,
  setActiveProjectId,
  setProjectMessages,
  loadAdminProjects,
  loadPeople,
  loadGroups,
  onExpandedTouchStart,
  onExpandedTouchMove,
  onExpandedTouchEnd,
  onHeaderDrag,
}: Props) {
  const tabBtn = (t: Tab, label: string, badge?: number) => (
    <button
      onClick={() => {
        setTab(t);
        if (t !== 'tasks') setSelectedTask(null);
        if (t !== 'search') setSearch('');
      }}
      className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
      style={{
        background: tab === t ? 'var(--brand-subtle)' : 'transparent',
        color: tab === t ? 'var(--brand)' : 'var(--text-3)',
      }}
    >
      {label}
      {!!badge && badge > 0 && tab !== t && (
        <span
          className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
          style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );

  const headerBtn = (title: string, onClick: () => void, icon: React.ReactNode) => (
    <button
      title={title}
      onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded-lg text-sm flex-shrink-0"
      style={{ color: 'var(--text-3)' }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
    >
      {icon}
    </button>
  );

  return (
    <>
      {/* Header - drag handle (desktop float-panel drag) or swipe-down-to-dismiss (expanded); also
          doubles as the grab handle itself (no separate bar needed - one less stacked row). Hidden
          on mobile while a sub-thread's own compact header is showing (see inSubThread above). */}
      <div
        onTouchStart={isExpanded ? onExpandedTouchStart : undefined}
        onTouchMove={isExpanded ? onExpandedTouchMove : undefined}
        onTouchEnd={isExpanded ? onExpandedTouchEnd : undefined}
        onTouchCancel={isExpanded ? onExpandedTouchEnd : undefined}
        className="hidden md:flex items-center justify-between px-4 py-3 flex-shrink-0 select-none"
        style={{
          borderBottom: isMinimized ? 'none' : '1px solid var(--border)',
          cursor: isExpanded ? 'default' : 'grab',
          touchAction: isExpanded ? 'none' : undefined,
        }}
        onPointerDown={isExpanded ? undefined : onHeaderDrag}
      >
        <div className="min-w-0">
          {!isAdminChat && tab === 'tasks' && selectedTask && !isMinimized ? (
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => {
                  setTab('messages');
                  setSelectedTask(null);
                }}
                className="text-xs font-medium flex-shrink-0 transition-colors"
                style={{ color: 'var(--brand)' }}
              >
                💬 Project chat
              </button>
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-3)' }}>
                ›
              </span>
              <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>
                {selectedTask.name}
              </span>
            </div>
          ) : (
            // Hidden on mobile - the tab bar directly below already shows which section is
            // selected, so this title would just repeat it; desktop keeps it as window chrome.
            <h2 className="hidden md:block text-sm font-semibold" style={{ color: 'var(--text)' }}>
              💬 {isAdminChat ? 'Admin chat' : 'Project chat'}
            </h2>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isExpanded &&
            headerBtn(isMinimized ? 'Restore' : 'Minimise', () => setIsMinimized((v) => !v), isMinimized ? '▲' : '−')}
          {window.innerWidth >= 768 &&
            headerBtn(
              isExpanded ? 'Exit fullscreen' : 'Fullscreen',
              () => {
                setIsExpanded((v) => !v);
                setIsMinimized(false);
              },
              isExpanded ? <CollapseIcon /> : <ExpandIcon />,
            )}
          {headerBtn('Close', onClose, '✕')}
        </div>
      </div>

      {/* Tabs - the top-most row on mobile (the panel header above is desktop-only there),
          so it also carries the swipe-down-to-dismiss handlers and a mobile-only close button.
          Hidden entirely on mobile while a sub-thread's own header is showing instead. Skipped
          entirely while minimized - matches the original inline layout, where this row lived
          inside ChatPanel's `{!isMinimized && (...)}` block alongside the tab bodies. */}
      {!isMinimized && (
        <div
          onTouchStart={isExpanded ? onExpandedTouchStart : undefined}
          onTouchMove={isExpanded ? onExpandedTouchMove : undefined}
          onTouchEnd={isExpanded ? onExpandedTouchEnd : undefined}
          onTouchCancel={isExpanded ? onExpandedTouchEnd : undefined}
          className={`${inSubThread ? 'hidden md:flex' : 'flex'} items-center gap-1 px-3 py-2 flex-shrink-0`}
          style={{ borderBottom: '1px solid var(--border)', touchAction: isExpanded ? 'none' : undefined }}
        >
          {/* pt-1.5 gives the unread badges (positioned -top-0.5 on each tab button, i.e.
              slightly overlapping the button's top-right corner) room to render - without it,
              this row's own overflow-x-auto forces overflow-y to 'auto' too (browsers coerce a
              'visible' cross-axis to 'auto' whenever the other axis isn't 'visible'), which was
              clipping the badges' top edge since they had zero slack above the buttons. */}
          <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto pt-1.5" style={{ scrollbarWidth: 'none' }}>
            {tabBtn('messages', isAdminChat ? 'Admin' : 'Project', unreadByTask.general)}
            {isAdminChat && (
              <button
                onClick={() => {
                  setTab('projects');
                  setSelectedTask(null);
                  setSearch('');
                  setActiveProjectId(null);
                  setProjectMessages([]);
                  loadAdminProjects();
                }}
                className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                style={{
                  background: tab === 'projects' ? 'var(--brand-subtle)' : 'transparent',
                  color: tab === 'projects' ? 'var(--brand)' : 'var(--text-3)',
                }}
              >
                Projects
              </button>
            )}
            <button
              onClick={() => {
                setTab('people');
                setSelectedTask(null);
                setSearch('');
                if (!activeConvId) loadPeople();
              }}
              className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
              style={{
                background: tab === 'people' ? 'var(--brand-subtle)' : 'transparent',
                color: tab === 'people' ? 'var(--brand)' : 'var(--text-3)',
              }}
            >
              Users
              {totalDmUnread > 0 && tab !== 'people' && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                >
                  {totalDmUnread > 99 ? '99+' : totalDmUnread}
                </span>
              )}
            </button>
            <button
              onClick={() => {
                setTab('groups');
                setSelectedTask(null);
                setSearch('');
                if (!activeGroupId) loadGroups();
              }}
              className="px-2 py-1.5 text-xs font-medium rounded-lg transition-colors flex-shrink-0 relative"
              style={{
                background: tab === 'groups' ? 'var(--brand-subtle)' : 'transparent',
                color: tab === 'groups' ? 'var(--brand)' : 'var(--text-3)',
              }}
            >
              Groups
              {totalGroupUnread > 0 && tab !== 'groups' && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-white text-[9px] font-bold"
                  style={{ background: '#ef4444', minWidth: 14, height: 14, padding: '0 2px' }}
                >
                  {totalGroupUnread > 99 ? '99+' : totalGroupUnread}
                </span>
              )}
            </button>
            {!isAdminChat && tabBtn('tasks', `Tasks${taskThreadCount > 0 ? ` (${taskThreadCount})` : ''}`, tasksUnread)}
            {tabBtn('files', 'Files')}
            {tabBtn('search', 'Search')}
          </div>
          <button
            onClick={onClose}
            aria-label="Close chat"
            className="md:hidden flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm ml-1"
            style={{ color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
