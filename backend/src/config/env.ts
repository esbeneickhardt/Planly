/**
 * Loads and validates required environment variables, exiting the process early if any
 * are missing or malformed.
 *
 * This module is imported as the very first line of index.ts so the process exits
 * immediately with a clear error message if any required variable is missing or too
 * short. All other modules import `config` from here instead of reading the environment
 * variables directly via process.env.
 */

// Required environment variables
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL', 'ENCRYPTION_KEY'] as const;

// Checking if environment variables are missing
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    console.error(`       Generate ENCRYPTION_KEY and JWT_SECRET with: openssl rand -hex 32`);
    process.exit(1);
  }
}

// ADMIN_EMAIL is not strictly required to boot but without it no user ever becomes admin
if (!process.env.ADMIN_EMAIL) {
  console.warn('WARNING: ADMIN_EMAIL is not set. No user will be granted admin rights on startup.');
  console.warn('         Set ADMIN_EMAIL in .env and restart to bootstrap the founding admin.');
}

// Checking JWT secret format
const jwtSecret = process.env.JWT_SECRET!;
if (jwtSecret.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters. Generate with: openssl rand -hex 32');
  process.exit(1);
}

// Checking ENCRYPTION_KEY format (must be exactly 64 lowercase hex characters = 32 bytes)
const encryptionKey = process.env.ENCRYPTION_KEY!;
if (!/^[0-9a-f]{64}$/.test(encryptionKey)) {
  console.error(
    'FATAL: ENCRYPTION_KEY must be exactly 64 lowercase hex characters (32 bytes). Generate with: openssl rand -hex 32',
  );
  process.exit(1);
}

// Checking DATABASE_URL contains a non-empty password (catches DB_PASSWORD missing from .env)
const dbUrl = process.env.DATABASE_URL!;
if (/:@/.test(dbUrl)) {
  console.error('FATAL: DATABASE_URL contains an empty password. Check that DB_PASSWORD is set in .env');
  process.exit(1);
}

// Creating dictionary with environment variables
export const config = {
  jwtSecret,
  databaseUrl: dbUrl,
  encryptionKey: encryptionKey,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  uploadsDir: (() => {
    const dir = process.env.UPLOADS_DIR ?? '/tmp/planly-uploads';
    if (!process.env.UPLOADS_DIR && !process.env.S3_BUCKET) {
      console.warn('WARNING: UPLOADS_DIR is not set and S3_BUCKET is not configured.');
      console.warn(`         Uploads will be stored in ${dir} which is lost on container restart.`);
    }
    return dir;
  })(),
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
  contactEmail: process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL || '',
};
