import { z } from 'zod';

const isoDate = z.string().datetime({ offset: true }).optional().nullable()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable());

export const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name required').max(500),
  description: z.string().max(50000).optional().nullable(),
  status: z.string().max(64).optional(),
  ownerId: z.string().uuid().optional().nullable(),
  reviewerId: z.string().uuid().optional().nullable(),
  deadline: isoDate,
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).optional().nullable(),
  canvasX: z.number().finite().optional(),
  canvasY: z.number().finite().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  name: z.string().min(1).max(500).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
