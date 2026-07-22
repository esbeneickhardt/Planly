/**
 * SSO / OpenID Connect routes - authorize redirect and callback handling.
 *
 * Supports any OIDC-compliant provider (Google, Microsoft, Auth0, Okta, Keycloak, …).
 * Enabled when OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are all set.
 *
 * Security:
 *   - PKCE (RFC 7636): code_verifier + code_challenge pair generated per authorization request.
 *   - Nonce: binds the ID token to this specific authorization request (prevents replay).
 *   - State + code_verifier stored in the SsoState DB table (not in-memory) for multi-replica safety.
 *   - State entries expire after 10 minutes and are deleted on first use.
 *
 * On successful SSO login, an account is created (emailVerified=true) if none exists for
 * that email, or the existing account is used. A full session cookie is then issued.
 */
import { FastifyInstance } from 'fastify';
import * as oidcClient from 'openid-client';
import { config } from '../config/env';
import prisma from '../db/client';
import jwt from 'jsonwebtoken';
import { issueAuthCookie } from '../utils/auth-cookie';
import { issueRefreshToken } from '../utils/refresh-tokens';
import { encryptOptional } from '../utils/crypto';

// Whether OIDC/SSO is active for this deployment (requires all three env vars to be set)
const SSO_ENABLED = !!(config.oidc.issuer && config.oidc.clientId && config.oidc.clientSecret);

// Cached OIDC discovery result — initialized lazily on first authorize request
let _oidcConfig: oidcClient.Configuration | null = null;

// Fetches (and caches) the OIDC provider configuration via discovery endpoint
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

// Redirect path registered with the IdP; must match the value in the OIDC application settings exactly
const CALLBACK_PATH = '/api/auth/sso/callback';

// Returns the absolute callback URL built from APP_URL so it works across environments
function callbackUrl(): string {
  return `${config.appUrl}${CALLBACK_PATH}`;
}

// SSO state is stored in the DB so PKCE/nonce callbacks work correctly across all replicas.

export async function ssoRoutes(app: FastifyInstance) {
  // Returns whether SSO is configured and what to call it on the login button
  app.get('/api/auth/sso/config', async (_req, reply) => {
    reply.send({ enabled: SSO_ENABLED, providerName: config.oidc.providerName });
  });

  if (!SSO_ENABLED) return;

  // Redirect user to IdP authorization endpoint
  app.get('/api/auth/sso/authorize', async (_req, reply) => {
    const cfg = await getOidcConfig();

    // Generate PKCE params and a one-time nonce for this authorization request
    const state = oidcClient.randomState();
    const nonce = oidcClient.randomNonce();
    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);

    // Persist state to DB for cross-replica callback validation (10-minute TTL)
    await prisma.ssoState.create({
      data: { state, codeVerifier, nonce, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    // Build and redirect to the IdP authorization URL
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
      const pending = await prisma.ssoState.findUnique({ where: { state } });
      if (!pending || pending.expiresAt < new Date()) {
        if (pending) await prisma.ssoState.delete({ where: { state } }).catch(() => {});
        return reply.redirect(`${config.frontendOrigin}/login?error=sso_state_mismatch`);
      }
      // Delete immediately - single-use to prevent replay
      await prisma.ssoState.delete({ where: { state } }).catch(() => {});

      // Exchange code for tokens; validates nonce and PKCE code verifier
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
        // Auto-provision a new account for first-time SSO users
        const baseUsername =
          (rawEmail.split('@')[0] || name || sub).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30) || 'user';
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
        // Link existing account to SSO - only reached when emailForLinking matched (verified)
        await prisma.user.update({
          where: { id: user.id },
          data: { ssoSub: sub, ssoProvider: config.oidc.providerName },
        });
      }

      // Issue session cookie and redirect to the app
      const token = jwt.sign(
        { userId: user.id, username: user.username, tokenVersion: user.tokenVersion },
        config.jwtSecret,
        { expiresIn: '1h' },
      );
      const rt = await issueRefreshToken(user.id);
      issueAuthCookie(reply, token, rt);
      reply.redirect(`${config.frontendOrigin}/kanban`);
    } catch (err) {
      app.log.error(err, 'SSO callback error');
      reply.redirect(`${config.frontendOrigin}/login?error=sso_failed`);
    }
  });
}
