import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username required').max(254),
  password: z.string().min(1, 'Password required').max(1024),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email('Invalid email address').max(254).toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(1024),
  realName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  avatarEmoji: z.string().max(10).optional(),
});

export type LoginInput    = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
