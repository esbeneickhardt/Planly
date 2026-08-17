FROM node:26-alpine AS builder
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run db:generate
RUN npm run build

FROM node:26-alpine
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache openssl su-exec
# Run as non-root for defence-in-depth
RUN addgroup -S planly && adduser -S planly -G planly
COPY package*.json ./
COPY prisma ./prisma
# prisma (the CLI, invoked directly below rather than via `npx`) is a real dependency so it
# survives --omit=dev; npm/npx themselves are only needed to run this install, not at runtime,
# so they're removed afterwards - this also drops their own bundled transitive deps (npm ships
# its own node_modules) from the image entirely, which container scans otherwise flag.
RUN npm ci --omit=dev && npm cache clean --force && \
  rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN chown -R planly:planly /app/node_modules
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "if echo \"$DATABASE_URL\" | grep -q ':@'; then echo 'FATAL: DATABASE_URL contains an empty password. Check that DB_PASSWORD is set in .env'; exit 1; fi && MIGRATE_URL=${DATABASE_DIRECT_URL:-$DATABASE_URL} && if [ -d prisma/migrations ] && [ \"$(ls -A prisma/migrations 2>/dev/null)\" ]; then echo '[db] Running prisma migrate deploy' && DATABASE_URL=$MIGRATE_URL ./node_modules/.bin/prisma migrate deploy; else echo '[db] No migrations folder found - running prisma db push (dev/first-run only)' && DATABASE_URL=$MIGRATE_URL ./node_modules/.bin/prisma db push; fi && node dist/index.js"]
