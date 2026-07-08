/**
 * useProductMembers — fetches and caches the members of a team that owns a project.
 *
 * Fetches once per teamId and caches the result in a module-level Map so
 * component remounts don't trigger redundant network requests. The cache is not
 * automatically invalidated — team membership changes infrequently and the app
 * refreshes on page reload. Pass teamId as null/undefined to skip fetching.
 */
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

type Member = Pick<User, 'id' | 'username' | 'avatarEmoji'>;

// Module-level cache: avoids re-fetching the same team on component remounts.
const membersCache = new Map<string, Member[]>();

// Call on logout or when a member_removed WS event fires for a specific team.
export function clearMembersCache(teamId?: string) {
  if (teamId) membersCache.delete(teamId);
  else membersCache.clear();
}

export function useProductMembers(teamId: string | undefined): Member[] {
  const [members, setMembers] = useState<Member[]>(() =>
    teamId ? (membersCache.get(teamId) ?? []) : [],
  );

  useEffect(() => {
    if (!teamId) return;
    if (membersCache.has(teamId)) {
      setMembers(membersCache.get(teamId)!);
      return;
    }
    api.teams.get(teamId)
      .then((team) => {
        const m = team.members.map((m) => m.user);
        membersCache.set(teamId, m);
        setMembers(m);
      })
      .catch(() => {});
  }, [teamId]);

  return members;
}
