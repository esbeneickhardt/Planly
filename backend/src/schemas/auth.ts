/**
 * Zod schemas for authentication request bodies.
 * loginSchema accepts either an email address or a username as the identifier.
 * registerSchema enforces password strength rules (minimum length, digit, special character)
 * and requires explicit TOS acceptance.
 */
import { z } from 'zod';

// Login - accepts email or username as identifier
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username required').max(254),
  password: z.string().min(1, 'Password required').max(1024),
});

// Registration - username restricted to URL-safe characters; password strength enforced via refinements
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username may only contain letters, numbers, underscores, and hyphens'),
  email: z.string().email('Invalid email address').max(254).toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(1024)
    .refine((p) => /[0-9]/.test(p), 'Password must contain at least one number')
    .refine((p) => /[^a-zA-Z0-9]/.test(p), 'Password must contain at least one special character'),
  realName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  avatarEmoji: z.string().max(10).optional(),
  tosAccepted: z.literal(true, { error: 'You must accept the Terms of Service to register' }),
});

export type LoginInput    = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
