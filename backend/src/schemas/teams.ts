/**
 * Zod schemas for team create and update request bodies.
 * Team creation never accepts other users' IDs - the creator is always the sole initial
 * member. Anyone else must be added via the consent-based invite flow (POST /teams/:id/members),
 * which requires the target to have invites enabled and to accept before membership is granted.
 */
import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name required').max(100),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
