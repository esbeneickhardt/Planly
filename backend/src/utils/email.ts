/**
 * Email sending utilities - SMTP transport, configuration resolution, and HTML templates.
 *
 * SMTP settings are resolved at send time: the database row (set via Admin → Email UI)
 * takes precedence over environment variables. This allows SMTP reconfiguration without
 * a container restart. When no SMTP is configured, emails are logged to stdout so
 * development works without a mail server.
 *
 * All email body content is HTML-escaped before interpolation.
 */
import nodemailer from 'nodemailer';
import { config } from '../config/env';
import { decryptValue } from './crypto';
import prisma from '../db/client';
import { logger } from './logger';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

type Transporter = ReturnType<typeof nodemailer.createTransport>;

// 5-second in-memory TTL cache for resolved SMTP settings, plus a transporter built from them -
// mirrors getServerConfig()'s cache pattern (server-config.ts). Without this, every sendEmail()
// call re-hits the DB for config and constructs a brand new nodemailer transporter, even when
// sending many emails in a short burst (e.g. the bulk verification-email send in
// admin/config.ts). The transporter is rebuilt whenever the settings themselves refresh.
interface SmtpCacheEntry {
  settings: SmtpSettings | null;
  transporter: Transporter | null;
  expiresAt: number;
}
let _cache: SmtpCacheEntry | null = null;
const SMTP_CACHE_TTL_MS = 5_000;

/** Call after an admin writes or clears the SMTP config so a stale settings/transporter pair
 * isn't reused past the change - mirrors invalidateServerConfigCache() in server-config.ts. */
export function invalidateSmtpCache() {
  _cache = null;
}

// Resolves active SMTP settings straight from the DB/env, with no caching - the private,
// uncached implementation behind the public getSmtpSettings() below.
async function resolveSmtpSettings(): Promise<SmtpSettings | null> {
  // Prefer DB row (admin-configured) over env vars
  try {
    const row = await prisma.smtpConfig.findUnique({
      where: { id: 'default' },
    });
    if (row?.host) {
      // Decrypt the stored password before returning (stored AES-256-GCM encrypted)
      return {
        host: row.host,
        port: row.port,
        secure: row.secure,
        user: row.user,
        pass: decryptValue(row.pass),
        from: row.from,
      };
    }
  } catch {
    /* table may not exist yet */
  }

  // Fall back to environment variables
  if (config.smtp.host) {
    return {
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      user: config.smtp.user,
      pass: config.smtp.pass,
      from: config.smtp.from,
    };
  }
  return null;
}

/**
 * Resolves active SMTP settings. Database row (written by Admin UI) wins over env vars.
 * Returns null when neither source is configured. Cached for SMTP_CACHE_TTL_MS so callers
 * sending several emails in quick succession don't each re-hit the DB.
 */
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) return _cache.settings;
  const settings = await resolveSmtpSettings();
  _cache = { settings, transporter: null, expiresAt: now + SMTP_CACHE_TTL_MS };
  return settings;
}

// Build a transporter from resolved SMTP settings
function buildTransporter(s: SmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
  });
}

// Returns the settings + a transporter built from them, reusing the cached transporter (if the
// settings cache is still warm) instead of constructing a new one on every call.
async function getTransporter(): Promise<{
  transporter: Transporter;
  settings: SmtpSettings;
} | null> {
  const settings = await getSmtpSettings(); // seeds/refreshes _cache as a side effect
  if (!settings || !_cache) return null;
  if (!_cache.transporter) _cache.transporter = buildTransporter(settings);
  return { transporter: _cache.transporter, settings };
}

// Legacy sync flag - still usable for startup-time checks (env vars only).
export const emailEnabled = !!config.smtp.host;

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  // Resolve settings (and a reusable transporter) at send time so admin changes take effect
  // within SMTP_CACHE_TTL_MS, without needing a restart.
  const resolved = await getTransporter();
  if (!resolved) {
    // Body intentionally omitted - it may contain password-reset tokens or other sensitive data.
    logger.info({ to, subject }, 'email skipped - no SMTP configured (body redacted)');
    return false;
  }
  await resolved.transporter.sendMail({
    from: resolved.settings.from,
    to,
    subject,
    html,
  });
  return true;
}

// ── Templates ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function resetPasswordEmail(resetUrl: string, username: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">Reset your Planly password</h2>
      <p>Hi ${escHtml(username)},</p>
      <p>Click the button below to reset your password. This link expires in 1 hour.</p>
      <a href="${resetUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Reset password
      </a>
      <p style="color:#666;font-size:14px">If you didn't request this, you can safely ignore this email.</p>
      <p style="color:#aaa;font-size:12px">Or copy this link: ${resetUrl}</p>
    </div>
  `;
}

export function verifyEmailTemplate(verifyUrl: string, username: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">Verify your Planly email</h2>
      <p>Hi ${escHtml(username)},</p>
      <p>Click below to verify your email address. This link expires in 24 hours.</p>
      <a href="${verifyUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Verify email
      </a>
      <p style="color:#aaa;font-size:12px">Or copy this link: ${verifyUrl}</p>
    </div>
  `;
}

export function mentionEmail(mentionerUsername: string, context: string, snippet: string, appUrl: string) {
  const safeContext = context.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeMentioner = mentionerUsername.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">You were mentioned in Planly</h2>
      <p><strong>@${safeMentioner}</strong> mentioned you${safeContext ? ` in <em>${safeContext}</em>` : ''}:</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #7c3aed;background:#f5f3ff;border-radius:4px;color:#444;font-size:14px">
        ${snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
      </blockquote>
      <a href="${appUrl}" style="display:inline-block;margin:16px 0;padding:10px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
        View in Planly
      </a>
      <p style="color:#aaa;font-size:12px">You can turn off email mention notifications in your Planly notification preferences.</p>
    </div>
  `;
}

export function directMessageEmail(senderUsername: string, snippet: string, appUrl: string, context?: string) {
  const safeSender = escHtml(senderUsername);
  const safeContext = context ? escHtml(context) : '';
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">New message in Planly</h2>
      <p><strong>${safeSender}</strong> sent you a message${safeContext ? ` in <em>${safeContext}</em>` : ''}:</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #7c3aed;background:#f5f3ff;border-radius:4px;color:#444;font-size:14px">
        ${snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
      </blockquote>
      <a href="${appUrl}" style="display:inline-block;margin:16px 0;padding:10px 20px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">
        View in Planly
      </a>
      <p style="color:#aaa;font-size:12px">You can turn off email message notifications in your Planly notification preferences.</p>
    </div>
  `;
}

export function teamInviteEmail(inviteUrl: string, teamName: string, inviterName: string) {
  const safeTeam = escHtml(teamName);
  const safeInviter = escHtml(inviterName);
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">You're invited to join ${safeTeam} on Planly</h2>
      <p>${safeInviter} has invited you to collaborate on <strong>${safeTeam}</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Accept invite
      </a>
      <p style="color:#aaa;font-size:12px">Or copy this link: ${inviteUrl}</p>
    </div>
  `;
}
