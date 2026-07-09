FROM node:26-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run db:generate
RUN npm run build

FROM node:26-alpine
WORKDIR /app
RUN apk add --no-cache openssl
# Run as non-root for defence-in-depth
RUN addgroup -S planly && adduser -S planly -G planly
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /data/uploads && chown planly:planly /data/uploads
USER planly

EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
