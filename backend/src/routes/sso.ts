import { FastifyInstance } from 'fastify';
import * as oidcClient from 'openid-client';
import { config } from '../config/env';
import prisma from '../db/client';
import jwt from 'jsonwebtoken';
import { issueAuthCookie } from '../utils/auth-cookie';
import { encryptOptional } from '../utils/crypto';

const SSO_ENABLED = !!(config.oidc.issuer && config.oidc.clientId && config.oidc.clientSecret);

let _oidcConfig: oidcClient.Configuration | null = null;

async function getOidcConfig(): Promise<oidcClient.Configuration> {
  if (_oidcConfig) return _oidcConfig;
  _oidcConfig = await oidcClient.discovery(
    new URL(config.oidc.issuer),
    config.oidc.clientId,
    { client_secret: config.oidc.clientSecret },
    oidcClient.ClientSecretPost(config.oidc.clientSecret),
  );
  return _oidcConfig;
}

const CALLBACK_PATH = '/api/auth/sso/callback';

function callbackUrl(): string {
  return `${config.appUrl}${CALLBACK_PATH}`;
}

// In-memory state store (good enough for single-instance; use Redis for multi-node)
const pendingStates = new Map<string, { codeVerifier: string; nonce: string; expiresAt: number }>();

// Cleanup old states periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingStates) {
    if (v.expiresAt < now) pendingStates.delete(k);
  }
}, 60_000);

export async function ssoRoutes(app: FastifyInstance) {
  // Returns whether SSO is configured and what to call it on the login button
  app.get('/api/auth/sso/config', async (_req, reply) => {
    reply.send({ enabled: SSO_ENABLED, providerName: config.oidc.providerName });
  });

  if (!SSO_ENABLED) return;

  // Redirect user to IdP authorization endpoint
  app.get('/api/auth/sso/authorize', async (_req, reply) => {
    const cfg = await getOidcConfig();
    const state = oidcClient.randomState();
    const nonce = oidcClient.randomNonce();
    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);

    pendingStates.set(state, { codeVerifier, nonce, expiresAt: Date.now() + 10 * 60 * 1000 });

    const url = oidcClient.buildAuthorizationUrl(cfg, {
      redirect_uri: callbackUrl(),
      scope: config.oidc.scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    reply.redirect(url.href);
  });

  // IdP redirects back here with ?code=...&state=...
  app.get('/api/auth/sso/callback', async (req, reply) => {
    try {
      const cfg = await getOidcConfig();
      const params = req.query as Record<string, string>;
      const state = params.state ?? '';
      const pending = pendingStates.get(state);
      if (!pending) return reply.redirect(`${config.frontendOrigin}/login?error=sso_state_mismatch`);
      pendingStates.delete(state);

      const currentUrl = new URL(`${callbackUrl()}?${new URLSearchParams(params).toString()}`);
      const tokens = await oidcClient.authorizationCodeGrant(cfg, currentUrl, {
        expectedState: state,
        expectedNonce: pending.nonce,
        pkceCodeVerifier: pending.codeVerifier,
      });

      const claims = tokens.claims();
      if (!claims) return reply.redirect(`${config.frontendOrigin}/login?error=sso_no_claims`);

      const sub = claims.sub;
      const rawEmail = ((claims.email as string | undefined) ?? '').toLowerCase().trim();
      // Only trust email for account-linking when the IdP has explicitly verified it.
      // An unverified email claim could be attacker-controlled and must not match existing accounts.
      const emailVerified = claims.email_verified === true;
      const emailForLinking = emailVerified ? rawEmail : '';
      const name = (claims.name as string | undefined) ?? (claims.preferred_username as string | undefined) ?? '';

      // Find existing user by SSO subject, or by email only when IdP-verified
      let user = await prisma.user.findFirst({
        where: { OR: [{ ssoSub: sub }, ...(emailForLinking ? [{ email: emailForLinking }] : [])] },
      });

      if (!user) {
        // Auto-provision new user
        const baseUsername = (rawEmail.split('@')[0] || name || sub).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user';
        let username = baseUsername;
        let attempt = 0;
        while (await prisma.user.findUnique({ where: { username } })) {
          attempt++;
          username = `${baseUsername}${attempt}`;
        }
        user = await prisma.user.create({
          data: {
            username,
            email: rawEmail || `${sub}@sso.local`,
            realName: encryptOptional(name || undefined),
            ssoProvider: config.oidc.providerName,
            ssoSub: sub,
            emailVerified,
            // passwordHash intentionally null - SSO users have no password
          },
        });
      } else if (!user.ssoSub) {
        // Link existing account to SSO — only reached when emailForLinking matched (verified)
        await prisma.user.update({ where: { id: user.id }, data: { ssoSub: sub, ssoProvider: config.oidc.providerName } });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username, tokenVersion: user.tokenVersion },
        config.jwtSecret,
        { expiresIn: '7d' },
      );
      issueAuthCookie(reply, token);
      reply.redirect(`${config.frontendOrigin}/kanban`);
    } catch (err) {
      app.log.error(err, 'SSO callback error');
      reply.redirect(`${config.frontendOrigin}/login?error=sso_failed`);
    }
  });
}
