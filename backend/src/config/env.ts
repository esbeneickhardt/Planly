const REQUIRED = ['JWT_SECRET', 'DATABASE_URL'] as const;

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

export const config = {
  jwtSecret: process.env.JWT_SECRET!,
  databaseUrl: process.env.DATABASE_URL!,
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  uploadsDir: process.env.UPLOADS_DIR ?? '/tmp/planly-uploads',
  port: parseInt(process.env.PORT ?? '3000'),
  appUrl: process.env.APP_URL ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
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
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
    requireWhitelist: process.env.REQUIRE_WHITELIST === 'true',
  },
};
