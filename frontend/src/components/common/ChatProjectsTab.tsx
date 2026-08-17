/**
 * ChatPanel's (admin-only) Projects tab: either an open project's chat thread or the browse list
 * of all projects. Split out of ChatPanel.tsx, which still owns the shared project state (via
 * useChatProjects) and passes it down as props.
 */
import type { Message } from '../../api/client';
import ChatMessageList from './ChatMessageList';
import ChatComposeBox, { type ChatComposeBoxProps } from './ChatComposeBox';

interface AdminProjectSummary {
  id: string;
  name: string;
  emoji: string | null;
}

interface Props {
  isExpanded: boolean;
  onExpandedTouchStart: (e: React.TouchEvent) => void;
  onExpandedTouchMove: (e: React.TouchEvent) => void;
  onExpandedTouchEnd: () => void;
  adminProjects: AdminProjectSummary[];
  activeProjectId: string | null;
  /** Resets the open project thread (id/messages/draft) without reloading the project list -
   * matches ChatPanel's original inline handler, which didn't refetch on close here either. */
  onBack: () => void;
  messages: Message[];
  onOpenProject: (id: string) => void;
  composeBoxProps: ChatComposeBoxProps;
  messageListProps: Omit<React.ComponentProps<typeof ChatMessageList>, 'messages' | 'showLoadOlder'>;
}

export default function ChatProjectsTab({
  isExpanded,
  onExpandedTouchStart,
  onExpandedTouchMove,
  onExpandedTouchEnd,
  adminProjects,
  activeProjectId,
  onBack,
  messages,
  onOpenProject,
  composeBoxProps,
  messageListProps,
}: Props) {
  if (activeProjectId) {
    // Project chat view
    return (
      <>
        <div
          onTouchStart={isExpanded ? onExpandedTouchStart : undefined}
          onTouchMove={isExpanded ? onExpandedTouchMove : undefined}
          onTouchEnd={isExpanded ? onExpandedTouchEnd : undefined}
          onTouchCancel={isExpanded ? onExpandedTouchEnd : undefined}
          className="flex items-center gap-2 px-2 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--border)',
            touchAction: isExpanded ? 'none' : undefined,
          }}
        >
          <button
            onClick={onBack}
            aria-label="Back"
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-lg"
            style={{ color: 'var(--text-2)' }}
          >
            ‹
          </button>
          <span
            className="w-8 h-8 rounded-full flex items-center justify-center text-base flex-shrink-0"
            style={{ background: 'var(--surface-2)' }}
            aria-hidden="true"
          >
            {adminProjects.find((p) => p.id === activeProjectId)?.emoji ?? '📁'}
          </span>
          <p className="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--text)' }}>
            {adminProjects.find((p) => p.id === activeProjectId)?.name ?? 'Project'}
          </p>
        </div>
        <ChatMessageList messages={messages} {...messageListProps} />
        <ChatComposeBox {...composeBoxProps} />
      </>
    );
  }

  // Projects list
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-3)' }}>
        All projects
      </p>
      {adminProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 gap-2" style={{ color: 'var(--text-3)' }}>
          <span className="text-2xl opacity-30">📋</span>
          <p className="text-sm">No projects found.</p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {adminProjects.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenProject(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors"
              style={{ background: 'transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="text-lg w-8 text-center flex-shrink-0">{p.emoji ?? '📋'}</span>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                {p.name}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
