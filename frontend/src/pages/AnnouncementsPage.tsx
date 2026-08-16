/**
 * Announcement feed displaying server-wide and team-scoped posts with Markdown rendering,
 * collapsible bodies, per-post comments, and a compose form for eligible users.
 * The posting context (admin vs. team) is derived from the current adminMode toggle and
 * active product; filter pills only appear when announcements span more than one source.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { markdownComponents } from '../components/common/markdownComponents';
import { api, displayName } from '../api/client';
import type { AnnItem, AnnComment } from '../api/client';
import type { Team } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useProduct } from '../context/ProductContext';
import type { RealtimeEvent } from '../context/ProductContext';
import { useChat } from '../context/ChatContext';
import { useConfirm } from '../context/ConfirmContext';
import MarkdownEditor from '../components/common/MarkdownEditor';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Compose / edit form ────────────────────────────────────────────────────────

function AnnouncementForm({
  initial,
  teamId,
  teamName,
  isAdmin,
  onSave,
  onCancel,
}: {
  initial?: AnnItem;
  teamId?: string;
  teamName?: string;
  isAdmin?: boolean;
  onSave: (data: {
    title: string;
    content: string;
    pinned: boolean;
    commentsEnabled: boolean;
    teamId?: string;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [commentsEnabled, setCommentsEnabled] = useState(initial?.commentsEnabled ?? true);
  const [saving, setSaving] = useState(false);

  const effectiveTeamId = initial ? initial.team?.id : teamId;
  const effectiveTeamName = initial ? initial.team?.name : teamName;

  async function handleSubmit() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), content: content.trim(), pinned, commentsEnabled, teamId: effectiveTeamId });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {initial ? 'Edit announcement' : 'New announcement'}
          </h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>
              Posting as
            </span>
            <span
              className="text-xs px-2 py-px rounded-full font-medium"
              style={
                !effectiveTeamId
                  ? { background: '#6366f120', color: '#6366f1', border: '1px solid #6366f133' }
                  : { background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }
              }
            >
              {effectiveTeamId ? `🏢 ${effectiveTeamName ?? effectiveTeamId}` : '🛡 Server Admins'}
            </span>
          </div>
        </div>
        <button onClick={onCancel} className="text-xs" style={{ color: 'var(--text-3)' }}>
          Cancel
        </button>
      </div>

      <input
        className="input w-full font-semibold"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ background: 'var(--surface)', fontSize: 15 }}
      />

      <MarkdownEditor
        value={content}
        onChange={setContent}
        rows={8}
        placeholder="Write your announcement in Markdown…"
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          {isAdmin && !effectiveTeamId && (
            <label
              className="flex items-center gap-2 cursor-pointer select-none text-xs"
              style={{ color: 'var(--text-2)' }}
            >
              <div
                onClick={() => setPinned((p) => !p)}
                className="w-7 h-4 rounded-full relative transition-colors flex-shrink-0 cursor-pointer"
                style={{ background: pinned ? '#6366f1' : 'var(--border)' }}
              >
                <div
                  className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                  style={{ left: pinned ? '14px' : '2px' }}
                />
              </div>
              Pin
            </label>
          )}
          <label
            className="flex items-center gap-2 cursor-pointer select-none text-xs"
            style={{ color: 'var(--text-2)' }}
          >
            <div
              onClick={() => setCommentsEnabled((c) => !c)}
              className="w-7 h-4 rounded-full relative transition-colors flex-shrink-0 cursor-pointer"
              style={{ background: commentsEnabled ? '#6366f1' : 'var(--border)' }}
            >
              <div
                className="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all"
                style={{ left: commentsEnabled ? '14px' : '2px' }}
              />
            </div>
            Comments
          </label>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim() || !content.trim()}
          className="btn-primary text-sm px-4"
        >
          {saving ? 'Saving…' : initial ? 'Save changes' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ── Compose icon button ────────────────────────────────────────────────────────

const ComposeIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// ── Comment section ────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, { background: string; color: string }> = {
  'Server Owner': { background: 'rgba(245,158,11,0.15)', color: '#d97706' },
  'Server Admin': { background: 'rgba(99,102,241,0.12)', color: '#6366f1' },
  'Project Owner': { background: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  'Project Co-Owner': { background: 'rgba(13,148,136,0.12)', color: '#0d9488' },
};

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return null;
  const s = ROLE_STYLE[role] ?? ROLE_STYLE['Server Admin']!;
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ ...s, lineHeight: 1.2 }}>
      {role}
    </span>
  );
}

// myRole is the pre-computed role for the current user when posting a comment here (null = no badge)
function CommentSection({
  annId,
  userId,
  isAdmin,
  myRole,
  onCountChange,
}: {
  annId: string;
  userId: string;
  isAdmin: boolean;
  myRole: string | null;
  onCountChange: (delta: number) => void;
}) {
  const { showToast } = useToast();
  const { addRealtimeListener } = useProduct();
  const [comments, setComments] = useState<AnnComment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.announcements.comments
      .list(annId)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [annId]);

  // Listen for real-time comment events to update the list (count updates are handled by the page)
  useEffect(() => {
    return addRealtimeListener((e: RealtimeEvent) => {
      if (e.event === 'announcement.commented') {
        const d = e.data as { announcementId: string; comment: AnnComment };
        if (d.announcementId !== annId) return;
        setComments((prev) => {
          if (!prev || prev.some((c) => c.id === d.comment.id)) return prev;
          return [...prev, d.comment];
        });
      }
      if (e.event === 'announcement.comment.deleted') {
        const d = e.data as { announcementId: string; commentId: string };
        if (d.announcementId !== annId) return;
        setComments((prev) => prev?.filter((c) => c.id !== d.commentId) ?? null);
      }
    });
  }, [annId, addRealtimeListener]);

  async function submit() {
    if (!draft.trim()) return;
    setSending(true);
    try {
      const c = await api.announcements.comments.create(annId, draft.trim(), myRole);
      setComments((prev) => [...(prev ?? []), c]);
      onCountChange(+1);
      setDraft('');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to post comment', 'error');
    } finally {
      setSending(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!(await confirm('Delete this comment?'))) return;
    try {
      await api.announcements.comments.delete(annId, commentId);
      // List is pruned here immediately; count update comes via the WS broadcast to avoid double-decrement
      setComments((prev) => prev?.filter((c) => c.id !== commentId) ?? []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete', 'error');
    }
  }

  if (loading)
    return (
      <div className="text-xs py-2" style={{ color: 'var(--text-3)' }}>
        Loading…
      </div>
    );

  return (
    <div className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      {comments?.length === 0 && (
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          No comments yet.
        </p>
      )}
      {comments?.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <span className="text-base flex-shrink-0 mt-0.5">{c.author?.avatarEmoji ?? '👤'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                {c.author ? displayName(c.author) : 'Deleted user'}
              </span>
              <RoleBadge role={c.postedAsRole} />
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {formatDate(c.createdAt)}
              </span>
              {(isAdmin || c.author?.id === userId) && (
                <button
                  onClick={() => deleteComment(c.id)}
                  className="text-xs ml-auto opacity-50 hover:opacity-100"
                  style={{ color: '#ef4444' }}
                >
                  Delete
                </button>
              )}
            </div>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>
              {c.content}
            </p>
          </div>
        </div>
      ))}
      <div className="flex gap-2 items-end">
        <textarea
          className="input flex-1 text-sm resize-none"
          rows={2}
          placeholder="Write a comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          style={{ background: 'var(--surface)' }}
        />
        <button
          onClick={submit}
          disabled={sending || !draft.trim()}
          className="btn-primary text-xs px-3 py-1.5 flex-shrink-0"
        >
          {sending ? '…' : 'Post'}
        </button>
      </div>
    </div>
  );
}

// ── Announcement card ──────────────────────────────────────────────────────────

const COLLAPSED_HEIGHT = 96;

// commentMyRole: the pre-computed role for the current user when commenting on this announcement
function AnnouncementCard({
  ann,
  canEdit,
  onEdit,
  onDelete,
  userId,
  isAdmin,
  commentMyRole,
  onCommentCountChange,
}: {
  ann: AnnItem;
  canEdit: boolean;
  onEdit: (a: AnnItem) => void;
  onDelete: (id: string) => void;
  userId: string;
  isAdmin: boolean;
  commentMyRole: string | null;
  onCommentCountChange: (delta: number) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > COLLAPSED_HEIGHT + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ann.content]);

  return (
    <article
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--surface)', border: `1px solid ${ann.pinned ? '#6366f133' : 'var(--border)'}` }}
    >
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {ann.pinned && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                style={{ background: '#6366f120', color: '#6366f1' }}
              >
                Pinned
              </span>
            )}
            <h2 className="text-base font-semibold leading-snug" style={{ color: 'var(--text)' }}>
              {ann.title}
            </h2>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => onEdit(ann)}
                className="text-xs px-2 py-0.5 rounded-lg opacity-60 hover:opacity-100"
                style={{ color: 'var(--text-2)', background: 'var(--surface)' }}
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(ann.id)}
                className="text-xs px-2 py-0.5 rounded-lg opacity-60 hover:opacity-100"
                style={{ color: '#ef4444', background: 'var(--surface)' }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-xs flex-wrap" style={{ color: 'var(--text-3)' }}>
          {ann.team && (
            <>
              <span className="font-medium" style={{ color: 'var(--text-2)' }}>
                🏢 {ann.team.name}
              </span>
              <span>·</span>
            </>
          )}
          <span>
            {ann.author?.avatarEmoji ?? '👤'} {ann.author ? displayName(ann.author) : 'Deleted user'}
          </span>
          <RoleBadge role={ann.postedAsRole} />
          <span>·</span>
          <span>{formatDate(ann.createdAt)}</span>
          {ann.updatedAt !== ann.createdAt && <span>(edited)</span>}
        </div>
      </div>

      <div className="px-5 pb-3">
        <div
          ref={bodyRef}
          className="text-sm overflow-hidden"
          style={{
            maxHeight: expanded ? undefined : COLLAPSED_HEIGHT,
            color: 'var(--text)',
            maskImage: !expanded && overflows ? 'linear-gradient(to bottom, black 60%, transparent 100%)' : undefined,
            WebkitMaskImage:
              !expanded && overflows ? 'linear-gradient(to bottom, black 60%, transparent 100%)' : undefined,
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
            {ann.content}
          </ReactMarkdown>
        </div>
        {overflows && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 text-xs font-medium"
            style={{ color: 'var(--brand)' }}
          >
            {expanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      <div
        className="px-5 pb-3 flex items-center gap-3"
        style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}
      >
        {ann.commentsEnabled ? (
          <button
            onClick={() => setCommentsOpen((o) => !o)}
            className="flex items-center gap-1 text-xs"
            style={{ color: commentsOpen ? 'var(--brand)' : 'var(--text-3)' }}
          >
            💬 {ann._count.comments} comment{ann._count.comments !== 1 ? 's' : ''}
            <span className="ml-1 text-[10px]">{commentsOpen ? '▲' : '▼'}</span>
          </button>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-3)' }}>
            Comments off
          </span>
        )}
      </div>

      {ann.commentsEnabled && commentsOpen && (
        <div className="px-5 pb-4">
          <CommentSection
            annId={ann.id}
            userId={userId}
            isAdmin={isAdmin}
            myRole={commentMyRole}
            onCountChange={onCommentCountChange}
          />
        </div>
      )}
    </article>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { activeProduct, products, addRealtimeListener } = useProduct();
  const { adminMode } = useChat();
  const { confirm } = useConfirm();

  // When in admin mode post as "Server Admins"; otherwise scope to the active product's team
  // adminMode mirrors the Admin toggle in the TopBar (true = on /admin as admin)
  const contextProduct = adminMode ? null : (activeProduct ?? (products.length === 1 ? products[0] : null));
  const contextTeamId = contextProduct?.teamId;

  const [announcements, setAnnouncements] = useState<AnnItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnnItem | null>(null);
  const [filter, setFilter] = useState<string | null>(null); // null=all, '__server__'=no team, teamId=specific

  const contextTeamName = teams.find((t) => t.id === contextTeamId)?.name;

  // Derive filter sources from loaded announcements
  const hasAdminAnnouncements = announcements.some((a) => !a.team);
  const announcementTeams = [
    ...new Map(announcements.filter((a) => a.team).map((a) => [a.team!.id, a.team!])).values(),
  ];
  // Show filter bar only when at least two distinct sources exist
  const showFilter = (hasAdminAnnouncements ? 1 : 0) + announcementTeams.length >= 2;
  const isProjectFilter = filter !== null && filter !== '__server__';

  const visibleAnnouncements =
    filter === null
      ? announcements
      : filter === '__server__'
        ? announcements.filter((a) => !a.team)
        : announcements.filter((a) => a.team?.id === filter);

  const sort = (list: AnnItem[]) =>
    [...list].sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  // Fetch announcements and teams in parallel; teams are needed for the "posting as" label
  const load = useCallback(async () => {
    try {
      const [data, allTeams] = await Promise.all([api.announcements.list(), api.teams.list()]);
      setAnnouncements(sort(data.announcements));
      setCanPost(data.canPost);
      setEnabled(data.enabled);
      setTeams(allTeams);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Update comment count badges in real-time when another user comments or deletes a comment
  useEffect(() => {
    return addRealtimeListener((e: RealtimeEvent) => {
      if (e.event === 'announcement.commented') {
        const d = e.data as { announcementId: string; comment: { author?: { id?: string } } };
        // Skip if current user posted (CommentSection already called onCountChange locally)
        if (d.comment?.author?.id === user?.id) return;
        setAnnouncements((prev) =>
          prev.map((a) => (a.id === d.announcementId ? { ...a, _count: { comments: a._count.comments + 1 } } : a)),
        );
      }
      if (e.event === 'announcement.comment.deleted') {
        const d = e.data as { announcementId: string; commentId: string };
        setAnnouncements((prev) =>
          prev.map((a) =>
            a.id === d.announcementId ? { ...a, _count: { comments: Math.max(0, a._count.comments - 1) } } : a,
          ),
        );
      }
    });
  }, [addRealtimeListener, user?.id]);

  // Compute postedAsRole for a new announcement based on its team scope and the current user's roles
  function computeAnnRole(teamId: string | undefined): string | null {
    if (!teamId) {
      if (user?.isFoundingAdmin) return 'Server Owner';
      if (user?.isAdmin) return 'Server Admin';
      return null;
    }
    const product = products.find((p) => p.teamId === teamId);
    if (product?.ownerId === user?.id) return 'Project Owner';
    const team = teams.find((t) => t.id === teamId);
    if (team?.members?.find((m) => m.userId === user?.id && m.role === 'co_owner')) return 'Project Co-Owner';
    return null;
  }

  async function handleCreate(data: {
    title: string;
    content: string;
    pinned: boolean;
    commentsEnabled: boolean;
    teamId?: string;
  }) {
    try {
      const ann = await api.announcements.create({ ...data, postedAsRole: computeAnnRole(data.teamId) });
      setAnnouncements((prev) => sort([ann, ...prev]));
      setShowForm(false);
      showToast('Announcement posted', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to post', 'error');
    }
  }

  async function handleUpdate(data: {
    title: string;
    content: string;
    pinned: boolean;
    commentsEnabled: boolean;
    teamId?: string;
  }) {
    if (!editing) return;
    try {
      const ann = await api.announcements.update(editing.id, data);
      setAnnouncements((prev) => sort(prev.map((a) => (a.id === ann.id ? ann : a))));
      setEditing(null);
      showToast('Announcement updated', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to update', 'error');
    }
  }

  async function handleDelete(id: string) {
    if (!(await confirm('Delete this announcement?'))) return;
    try {
      await api.announcements.delete(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
      showToast('Deleted', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to delete', 'error');
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
        />
      </div>
    );

  if (error)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm" style={{ color: 'var(--text-3)' }}>
          {error}
        </p>
      </div>
    );

  if (!enabled && !canPost)
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-2xl">📢</p>
        <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
          Announcements are not available
        </p>
        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
          Ask a server admin to enable this feature.
        </p>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
            Announcements
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
            Posts from server admins and teams
          </p>
        </div>
        {canPost && !editing && (
          <div className="flex items-center gap-2">
            {/* Mode badge - always visible when user can post */}
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={
                adminMode
                  ? { background: '#6366f120', color: '#6366f1', border: '1px solid #6366f133' }
                  : { background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }
              }
            >
              {adminMode ? '🛡 Server Admins' : contextTeamName ? `🏢 ${contextTeamName}` : 'Server-wide'}
            </span>
            <button
              onClick={() => setShowForm((f) => !f)}
              title="New announcement"
              className="flex items-center justify-center w-8 h-8 rounded-xl transition-colors"
              style={{
                background: showForm ? 'var(--brand)' : 'var(--surface-2)',
                color: showForm ? '#fff' : 'var(--text-2)',
                border: '1px solid var(--border)',
              }}
            >
              <ComposeIcon />
            </button>
          </div>
        )}
      </div>

      {/* Filter bar - only shown when announcements span multiple sources */}
      {showFilter && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className="text-xs px-3 py-1 rounded-full transition-colors"
            style={{
              background: filter === null ? 'var(--brand)' : 'var(--surface-2)',
              color: filter === null ? '#fff' : 'var(--text-2)',
              border: `1px solid ${filter === null ? 'var(--brand)' : 'var(--border)'}`,
              fontWeight: filter === null ? 600 : 400,
            }}
          >
            All
          </button>

          {hasAdminAnnouncements && (
            <button
              onClick={() => setFilter('__server__')}
              className="text-xs px-3 py-1 rounded-full transition-colors"
              style={{
                background: filter === '__server__' ? 'var(--brand)' : 'var(--surface-2)',
                color: filter === '__server__' ? '#fff' : 'var(--text-2)',
                border: `1px solid ${filter === '__server__' ? 'var(--brand)' : 'var(--border)'}`,
                fontWeight: filter === '__server__' ? 600 : 400,
              }}
            >
              Admin
            </button>
          )}

          {announcementTeams.length > 0 && (
            <div className="relative" style={{ display: 'inline-block' }}>
              <select
                value={isProjectFilter ? filter! : ''}
                onChange={(e) => setFilter(e.target.value || null)}
                className="text-xs rounded-full outline-none cursor-pointer transition-colors"
                style={{
                  background: isProjectFilter ? 'var(--brand)' : 'var(--surface-2)',
                  color: isProjectFilter ? '#fff' : 'var(--text-2)',
                  border: `1px solid ${isProjectFilter ? 'var(--brand)' : 'var(--border)'}`,
                  fontWeight: isProjectFilter ? 600 : 400,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingTop: '0.25rem',
                  paddingBottom: '0.25rem',
                  paddingLeft: '0.625rem',
                  paddingRight: '1.5rem',
                }}
              >
                <option value="" style={{ background: 'var(--surface)', color: 'var(--text-2)' }}>
                  Project…
                </option>
                {announcementTeams.map((t) => (
                  <option key={t.id} value={t.id} style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                    {t.name}
                  </option>
                ))}
              </select>
              <span
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                  fontSize: '0.55rem',
                  color: isProjectFilter ? 'rgba(255,255,255,0.8)' : 'var(--text-3)',
                }}
              >
                ▼
              </span>
            </div>
          )}
        </div>
      )}

      {!enabled && user?.isAdmin && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: '#f59e0b15', border: '1px solid #f59e0b44' }}
        >
          <span style={{ color: '#f59e0b' }}>⚠</span>
          <span style={{ color: 'var(--text-2)' }}>
            Announcements are <strong>disabled for members</strong>. Enable them in Admin settings.
          </span>
        </div>
      )}

      {/* Compose form */}
      {canPost && showForm && !editing && (
        <AnnouncementForm
          teamId={contextTeamId}
          teamName={contextTeamName}
          isAdmin={user?.isAdmin}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Feed */}
      {visibleAnnouncements.length === 0 && !showForm ? (
        <div className="text-center py-16 space-y-2">
          <p className="text-3xl">📢</p>
          <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
            {announcements.length === 0 ? 'No announcements yet' : 'No announcements match this filter'}
          </p>
          {canPost && announcements.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--text-3)' }}>
              Click the compose icon above to post the first one.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleAnnouncements.map((ann) =>
            editing?.id === ann.id ? (
              <AnnouncementForm
                key={ann.id}
                initial={ann}
                isAdmin={user?.isAdmin}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <AnnouncementCard
                key={ann.id}
                ann={ann}
                canEdit={!!(user?.isAdmin || ann.author?.id === user?.id)}
                onEdit={setEditing}
                onDelete={handleDelete}
                userId={user?.id ?? ''}
                isAdmin={user?.isAdmin ?? false}
                commentMyRole={
                  adminMode ? computeAnnRole(undefined) : ann.team?.id ? computeAnnRole(ann.team.id) : null
                }
                onCommentCountChange={(delta) =>
                  setAnnouncements((prev) =>
                    prev.map((a) => (a.id === ann.id ? { ...a, _count: { comments: a._count.comments + delta } } : a)),
                  )
                }
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}
