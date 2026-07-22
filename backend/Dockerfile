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
RUN apk upgrade --no-cache && apk add --no-cache openssl && npm install -g npm@latest
# Run as non-root for defence-in-depth
RUN addgroup -S planly && adduser -S planly -G planly
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /data/uploads && chown planly:planly /data/uploads && chown -R planly:planly /app/node_modules
USER planly

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["sh", "-c", "if echo \"$DATABASE_URL\" | grep -q ':@'; then echo 'FATAL: DATABASE_URL contains an empty password. Check that DB_PASSWORD is set in .env'; exit 1; fi && if ! touch \"$UPLOADS_DIR/.write_test\" 2>/dev/null; then echo \"FATAL: uploads directory '$UPLOADS_DIR' is not writable by the planly user. Check volume mount permissions.\"; exit 1; fi && rm -f \"$UPLOADS_DIR/.write_test\" && MIGRATE_URL=${DATABASE_DIRECT_URL:-$DATABASE_URL} && if [ -d prisma/migrations ] && [ \"$(ls -A prisma/migrations 2>/dev/null)\" ]; then echo '[db] Running prisma migrate deploy' && DATABASE_URL=$MIGRATE_URL npx prisma migrate deploy; else echo '[db] No migrations folder found — running prisma db push (dev/first-run only)' && DATABASE_URL=$MIGRATE_URL npx prisma db push; fi && node dist/index.js"]
