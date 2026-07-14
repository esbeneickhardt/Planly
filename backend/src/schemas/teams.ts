/**
 * Zod schemas for team create and update request bodies.
 * memberIds on create is optional - a team can be created with no initial members
 * and members added later via the team membership endpoints.
 */
import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name required').max(100),
  memberIds: z.array(z.string().uuid()).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
