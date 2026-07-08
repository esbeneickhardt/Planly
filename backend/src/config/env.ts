/**
 * Environment variable validation and typed configuration.
 *
 * Imported as the very first line of index.ts so the process exits immediately
 * with a clear error message if any required variable is missing or too short.
 * All other modules import `config` from here instead of reading process.env directly.
 */
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL', 'ENCRYPTION_KEY'] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    console.error(`       Generate ENCRYPTION_KEY with: openssl rand -hex 32`);
    process.exit(1);
  }
}

const jwtSecret = process.env.JWT_SECRET!;
if (jwtSecret.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
  process.exit(1);
}

export const config = {
  jwtSecret,
  databaseUrl: process.env.DATABASE_URL!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  uploadsDir: process.env.UPLOADS_DIR ?? '/tmp/planly-uploads',
  port: parseInt(process.env.PORT ?? '3000'),
  appUrl: process.env.APP_URL ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  trustedProxyDepth: parseInt(process.env.TRUSTED_PROXY_DEPTH ?? '1', 10),
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587'),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Planly <noreply@planly.app>',
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER ?? '',
    clientId: process.env.OIDC_CLIENT_ID ?? '',
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? '',
    providerName: process.env.OIDC_PROVIDER_NAME ?? 'SSO',
    scopes: process.env.OIDC_SCOPES ?? 'openid email profile',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
};
