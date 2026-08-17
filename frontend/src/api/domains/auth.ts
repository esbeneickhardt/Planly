/**
 * Core authentication endpoints: login/logout/session (`me`), password reset and change,
 * email verification, SSO config, and the TOTP/MFA setup-confirm-challenge flow.
 */

import { request, json } from '../httpClient';
import type { User } from '../../types';

export const auth = {
  login: (identifier: string, password: string) =>
    request<User | { requiresTOTP: true; mfaToken: string }>('/api/auth/login', {
      method: 'POST',
      body: json({ identifier, password }),
    }),
  logout: () =>
    request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: json({}),
    }),
  me: () => request<User>('/api/auth/me'),
  emailEnabled: () => request<{ enabled: boolean }>('/api/auth/email-enabled'),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/api/auth/forgot-password', {
      method: 'POST',
      body: json({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/reset-password', {
      method: 'POST',
      body: json({ token, password }),
    }),
  sendVerification: () =>
    request<{ ok: boolean }>('/api/auth/send-verification', {
      method: 'POST',
      body: json({}),
    }),
  resendVerification: (email: string) =>
    request<{ ok: boolean }>('/api/auth/resend-verification', {
      method: 'POST',
      body: json({ email }),
    }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean }>('/api/auth/verify-email', {
      method: 'POST',
      body: json({ token }),
    }),
  ssoConfig: () => request<{ enabled: boolean; providerName: string }>('/api/auth/sso/config'),
  changePassword: (data: { currentPassword?: string; newPassword: string }) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: json(data),
    }),
  totpStatus: () => request<{ totpEnabled: boolean }>('/api/auth/totp/status'),
  totpSetup: () =>
    request<{ qrDataUrl: string; secret: string; uri: string }>('/api/auth/totp/setup', {
      method: 'POST',
      body: json({}),
    }),
  totpConfirm: (code: string) =>
    request<{ ok: boolean; backupCodes: string[]; message: string }>('/api/auth/totp/confirm', {
      method: 'POST',
      body: json({ code }),
    }),
  totpDisable: (code: string) =>
    request<{ ok: boolean }>('/api/auth/totp/disable', {
      method: 'DELETE',
      body: json({ code }),
    }),
  totpChallenge: (mfaToken: string, code: string) =>
    request<User>('/api/auth/totp/challenge', {
      method: 'POST',
      body: json({ mfaToken, code }),
    }),
};
