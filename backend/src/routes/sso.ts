import { FastifyInstance } from 'fastify';
import * as oidcClient from 'openid-client';
import { config } from '../config/env';
import prisma from '../db/client';
import jwt from 'jsonwebtoken';

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
      const state = params.state;
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
      const email = (claims.email as string | undefined) ?? '';
      const name = (claims.name as string | undefined) ?? (claims.preferred_username as string | undefined) ?? '';

      // Find existing user by SSO subject or email
      let user = await prisma.user.findFirst({
        where: { OR: [{ ssoSub: sub }, ...(email ? [{ email }] : [])] },
      });

      if (!user) {
        // Auto-provision new user
        const baseUsername = (email.split('@')[0] || name || sub).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user';
        let username = baseUsername;
        let attempt = 0;
        while (await prisma.user.findUnique({ where: { username } })) {
          attempt++;
          username = `${baseUsername}${attempt}`;
        }
        user = await prisma.user.create({
          data: {
            username,
            email: email || `${sub}@sso.local`,
            realName: name || undefined,
            ssoProvider: config.oidc.providerName,
            ssoSub: sub,
            emailVerified: true,
            // passwordHash intentionally null — SSO users have no password
          },
        });
      } else if (!user.ssoSub) {
        // Link existing email account to SSO
        await prisma.user.update({ where: { id: user.id }, data: { ssoSub: sub, ssoProvider: config.oidc.providerName } });
      }

      const token = jwt.sign(
        { userId: user.id, username: user.username },
        config.jwtSecret,
        { expiresIn: '7d' },
      );
      reply
        .setCookie('token', token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 3600 })
        .redirect(`${config.frontendOrigin}/kanban`);
    } catch (err) {
      app.log.error(err, 'SSO callback error');
      reply.redirect(`${config.frontendOrigin}/login?error=sso_failed`);
    }
  });
}
