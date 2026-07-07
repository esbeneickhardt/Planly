import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { User } from '../types';

type Member = Pick<User, 'id' | 'username' | 'avatarEmoji'>;

export function useProductMembers(teamId: string | undefined): Member[] {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!teamId) return;
    api.teams.get(teamId)
      .then((team) => setMembers(team.members.map((m) => m.user)))
      .catch(() => {});
  }, [teamId]);

  return members;
}
