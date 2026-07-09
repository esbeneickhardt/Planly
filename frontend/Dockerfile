FROM node:26-alpine AS builder
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/nginx.conf.template
# Default matches the Docker Compose service name; override via BACKEND_URL env var for K8s.
ENV BACKEND_URL=http://backend:3000
CMD ["/bin/sh", "-c", "envsubst '$BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
EXPOSE 80
