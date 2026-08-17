/**
 * Manages ChatPanel's compose box: draft text, attachments, @ mention autocomplete, the emoji/
 * markdown-help/more-tools toggles, and file upload/paste/delete - plus the `send()` dispatcher
 * that routes a submitted draft to whichever thread is actually open (DM, group, admin project,
 * task thread, or the general project/admin channel).
 *
 * `send()` intentionally stays a single function with one branch per destination rather than
 * several small hooks, mirroring the original inline implementation - the five branches share
 * near-identical draft/attachment reset + refocus bookkeeping, and splitting them apart would only
 * relocate that duplication rather than remove it.
 */
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import type React from 'react';
import { api } from '../api/client';
import type { Message, DirectMessage, MessageAttachment } from '../api/client';
import type { Product, User } from '../types';
import type { ReplyingTo, TeamMemberEntry } from '../components/common/ChatComposeBox';

export type Tab = 'messages' | 'tasks' | 'search' | 'files' | 'people' | 'groups' | 'projects';

interface Options {
  isAdminChat: boolean;
  adminMode: boolean;
  activeProduct: Product | null;
  user: User | null;
  productId: string | undefined;
  tab: Tab;
  sendTaskId: string | undefined;
  activeConvId: string | null;
  activeGroupId: string | null;
  activeProjectId: string | null;
  isMobile: boolean;
  confirm: (message: string) => Promise<boolean>;
  setAllMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setDmMessages: React.Dispatch<React.SetStateAction<DirectMessage[]>>;
  setGroupMessages: React.Dispatch<React.SetStateAction<DirectMessage[]>>;
  setProjectMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}

export function useChatCompose({
  isAdminChat,
  adminMode,
  activeProduct,
  user,
  productId,
  tab,
  sendTaskId,
  activeConvId,
  activeGroupId,
  activeProjectId,
  isMobile,
  confirm,
  setAllMessages,
  setDmMessages,
  setGroupMessages,
  setProjectMessages,
}: Options) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // @ mention state
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionCursorStart, setMentionCursorStart] = useState<number>(0);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const [teamMembers, setTeamMembers] = useState<TeamMemberEntry[]>([]);

  // Reply state - shared across tabs
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);

  const [showComposePicker, setShowComposePicker] = useState(false);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  // Mobile-only overflow menu for Emoji/Markdown/Preview - keeps the compose bar down to just
  // Attach + textarea + Send on a phone, closer to Messenger's minimal bar.
  const [showMoreTools, setShowMoreTools] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Mobile's single-line compose textarea grows with the message (up to the same 100px cap it
  // already had) instead of staying a fixed one-line height. "Multiline" (which switches the
  // +/textarea/Send row from centered to bottom-anchored) is judged against THIS device's own
  // actual empty-textarea height, captured once, rather than a hardcoded pixel guess - line-height
  // and padding render slightly differently across browsers/fonts, and a static threshold could
  // misfire and leave the row bottom-anchored (looking off-center) even for a single line.
  const [composeMultiline, setComposeMultiline] = useState(false);
  const singleLineHeightRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!isMobile) return;
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const next = Math.min(ta.scrollHeight, 100);
    ta.style.height = `${next}px`;
    if (!draft) singleLineHeightRef.current = next;
    const baseline = singleLineHeightRef.current ?? next;
    setComposeMultiline(next > baseline + 4);
  }, [draft, isMobile]);

  // Load team members for @ mentions (not applicable in admin chat)
  useEffect(() => {
    if (isAdminChat) return;
    const teamId = activeProduct?.teamId;
    if (!teamId) return;
    api.teams
      .get(teamId)
      .then((team) => setTeamMembers(team.members.map((m) => ({ ...m.user, role: m.role }))))
      .catch(() => {});
  }, [isAdminChat, activeProduct?.teamId]);

  // Filtered mention candidates. "@all" is a standard-chat-style shortcut (like Slack's @channel)
  // that notifies every project team member - it's a synthetic entry alongside real members, not
  // a real TeamMemberEntry, matching the same shape so the dropdown below needs no special-casing.
  const mentionCandidates = useMemo(() => {
    if (mentionSearch === null) return [];
    const q = mentionSearch.toLowerCase();
    const members = teamMembers
      .filter(
        (m) =>
          m.id !== user?.id &&
          (m.username.toLowerCase().startsWith(q) || m.realName?.trim().toLowerCase().startsWith(q)),
      )
      .slice(0, 6);
    const allEntry: TeamMemberEntry = {
      id: '__all__',
      username: 'all',
      realName: 'Everyone',
      avatarEmoji: '📢',
    };
    // Only offered in project chat, where the backend actually fans out notifications for it -
    // admin chat has no team roster and no backend support for this shortcut.
    return !isAdminChat && 'all'.startsWith(q) ? [allEntry, ...members] : members;
  }, [mentionSearch, teamMembers, user?.id, isAdminChat]);

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setDraft(val);
    const cursor = e.target.selectionStart ?? val.length;
    const textBeforeCursor = val.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    if (mentionMatch) {
      setMentionSearch(mentionMatch[1] ?? null);
      setMentionCursorStart(cursor - mentionMatch[0].length);
      setMentionHighlight(0);
    } else {
      setMentionSearch(null);
    }
  }

  function insertMention(username: string) {
    const before = draft.slice(0, mentionCursorStart);
    const after = draft.slice(mentionCursorStart + 1 + (mentionSearch?.length ?? 0));
    const newDraft = `${before}@${username} ${after}`;
    setDraft(newDraft);
    setMentionSearch(null);
    setTimeout(() => {
      if (textRef.current) {
        const pos = before.length + username.length + 2;
        textRef.current.focus();
        textRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  }

  // Compute the role badge to attach to a new message based on current mode and context
  function computePostedAsRole(): string | null {
    if (isAdminChat || adminMode) {
      if (user?.isFoundingAdmin) return 'Server Owner';
      if (user?.isAdmin) return 'Server Admin';
    }
    if (activeProduct?.ownerId === user?.id) return 'Project Owner';
    const member = teamMembers.find((m) => m.id === user?.id);
    if (member?.role === 'co_owner') return 'Project Co-Owner';
    return null;
  }

  async function send() {
    if (!draft.trim() && attachments.length === 0) return;

    // Route to DM when a conversation is open in the People tab
    if (tab === 'people' && activeConvId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.conversations.send(activeConvId, draft.trim(), replyingTo?.id);
        setDmMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
        setReplyingTo(null);
        await api.conversations.markRead(activeConvId).catch(() => {});
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    // Route to a group thread when one is open in the Groups tab
    if (tab === 'groups' && activeGroupId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.conversations.send(activeGroupId, draft.trim(), replyingTo?.id);
        setGroupMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
        setReplyingTo(null);
        await api.conversations.markRead(activeGroupId).catch(() => {});
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    // Route to project chat when admin is viewing a project in the Projects tab
    if (tab === 'projects' && activeProjectId) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        const msg = await api.admin.postProjectMessage(activeProjectId, draft.trim(), computePostedAsRole());
        setProjectMessages((prev) => [...prev, msg]);
        setDraft('');
        setAttachments([]);
        setPreview(false);
      } catch (err) {
        alert((err as Error).message ?? 'Failed to send message');
      } finally {
        setSending(false);
        setTimeout(() => textRef.current?.focus(), 0);
      }
      return;
    }

    if (!isAdminChat && !productId) return;
    setSending(true);
    try {
      const postedAsRole = computePostedAsRole();
      const msg = isAdminChat
        ? await api.adminChat.create({
            content: draft.trim(),
            replyToId: replyingTo?.id,
            attachments,
            postedAsRole,
          })
        : await api.messages.create(productId!, {
            content: draft.trim(),
            taskId: sendTaskId,
            replyToId: replyingTo?.id,
            attachments,
            postedAsRole,
          });
      setAllMessages((prev) => [...prev, msg]);
      setDraft('');
      setAttachments([]);
      setPreview(false);
      setMentionSearch(null);
      setReplyingTo(null);
    } catch (err) {
      alert((err as Error).message ?? 'Failed to send message');
    } finally {
      setSending(false);
      setTimeout(() => textRef.current?.focus(), 0);
    }
  }

  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSearch !== null && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionHighlight((h) => Math.min(h + 1, mentionCandidates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionHighlight]!.username);
        return;
      }
      if (e.key === 'Escape') {
        setMentionSearch(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => api.upload(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItems = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith('image/'));
    if (!imageItems.length) return;
    e.preventDefault();
    setUploading(true);
    try {
      const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
      const uploaded = await Promise.all(files.map((f) => api.upload(f)));
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      alert((err as Error).message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteFile(url: string) {
    if (!(await confirm('Delete this file? It will no longer be accessible from chat messages.'))) return;
    const filename = url.split('/').pop() ?? '';
    setDeletingFile(url);
    try {
      await api.deleteUpload(filename);
      // Remove from messages in local state so Files tab updates immediately
      setAllMessages((prev) =>
        prev.map((m) => ({
          ...m,
          attachments: m.attachments.filter((a) => a.url !== url),
        })),
      );
    } catch {
      /* file may already be gone */
    } finally {
      setDeletingFile(null);
    }
  }

  return {
    draft,
    setDraft,
    sending,
    preview,
    setPreview,
    attachments,
    setAttachments,
    uploading,
    deletingFile,
    mentionSearch,
    setMentionSearch,
    mentionHighlight,
    setMentionHighlight,
    mentionCandidates,
    teamMembers,
    replyingTo,
    setReplyingTo,
    showComposePicker,
    setShowComposePicker,
    showMarkdownHelp,
    setShowMarkdownHelp,
    showMoreTools,
    setShowMoreTools,
    composeMultiline,
    fileRef,
    textRef,
    handleDraftChange,
    handleDraftKeyDown,
    handlePaste,
    insertMention,
    send,
    handleFileChange,
    handleDeleteFile,
  };
}
