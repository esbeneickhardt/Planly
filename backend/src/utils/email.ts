import nodemailer from 'nodemailer';
import { config } from '../config/env';
import prisma from '../db/client';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

// Returns active SMTP settings: DB config takes precedence over env vars.
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  try {
    const row = await prisma.smtpConfig.findUnique({ where: { id: 'default' } });
    if (row?.host) {
      return { host: row.host, port: row.port, secure: row.secure, user: row.user, pass: row.pass, from: row.from };
    }
  } catch { /* table may not exist yet */ }

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

function buildTransporter(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.pass },
  });
}

// Legacy sync flag — still usable for startup-time checks (env vars only).
export const emailEnabled = !!config.smtp.host;

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<boolean> {
  const settings = await getSmtpSettings();
  if (!settings) {
    console.log(`\n[email:no-smtp] To: ${to}\nSubject: ${subject}\n---\n${html.replace(/<[^>]+>/g, '')}\n---\n`);
    return false;
  }
  const transporter = buildTransporter(settings);
  await transporter.sendMail({ from: settings.from, to, subject, html });
  return true;
}

// ── Templates ──────────────────────────────────────────────────────────────────

export function resetPasswordEmail(resetUrl: string, username: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">Reset your Planly password</h2>
      <p>Hi ${username},</p>
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
      <p>Hi ${username},</p>
      <p>Click below to verify your email address. This link expires in 24 hours.</p>
      <a href="${verifyUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Verify email
      </a>
      <p style="color:#aaa;font-size:12px">Or copy this link: ${verifyUrl}</p>
    </div>
  `;
}

export function teamInviteEmail(inviteUrl: string, teamName: string, inviterName: string) {
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="margin:0 0 16px">You're invited to join ${teamName} on Planly</h2>
      <p>${inviterName} has invited you to collaborate on <strong>${teamName}</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:600">
        Accept invite
      </a>
      <p style="color:#aaa;font-size:12px">Or copy this link: ${inviteUrl}</p>
    </div>
  `;
}
