# Plan: Persistent File Storage + Frontend K8s Replicas

## Current state

| Concern | Today |
|---|---|
| Upload storage | Named Docker volume `uploads_data` mounted at `/data/uploads` in the backend container. Survives `docker compose restart` and `docker compose down`, but **lost with `docker compose down -v`**. Files not visible on the host filesystem. |
| S3 support | **Already fully implemented** in `backend/src/utils/storage.ts`. Activated by setting `AWS_S3_BUCKET`. Supports `AWS_ENDPOINT_URL` for Scaleway / MinIO. No code changes needed. |
| MinIO | Already documented in `docker-compose.yml` as a commented-out block. |
| Nginx backend URL | `proxy_pass http://backend:3000` hardcoded in `frontend/nginx.conf`. Works in Docker Compose (the `backend` service name resolves). Breaks if the K8s service is named differently or if you point the frontend at a different host. |

---

## Part 1 — Persistent file uploads

There are two options. Implement both: bind mount as the default, S3 as the production upgrade path.

### Option A: Host bind mount (local directory)

**What changes:**

1. `docker-compose.yml` — replace the named volume mount with a bind mount:

   ```yaml
   # before
   volumes:
     - uploads_data:/data/uploads
   
   # after
   volumes:
     - ./data/uploads:/data/uploads
   ```

   Remove `uploads_data:` from the top-level `volumes:` section.

2. `.gitignore` — add the data directory (files should not go into git):

   ```
   data/
   ```

3. Create `data/uploads/` on the host before first run (or Docker will create it as root):

   ```bash
   mkdir -p data/uploads
   ```

**Result:** Uploads live at `./data/uploads/` on the host machine. They survive `docker compose down -v`, are easy to inspect and back up, and can be moved to a new server with `rsync`.

**Trade-off:** If you run multiple backend replicas on the same machine, they can all read the same bind-mount directory (since it's on the same host). Across multiple machines (true K8s multi-node), you'd need a shared network filesystem or Object Storage instead.

---

### Option B: S3 / Scaleway Object Storage / MinIO

**No code changes needed** — `storage.ts` already handles this. All that's needed is configuration.

**What changes:**

1. `.env.example` — add a section documenting the S3 env vars. Full snippet to append:

   ```bash
   # ── File uploads: S3-compatible object storage (optional) ───────────────────
   # By default, uploads are stored in a local directory (UPLOADS_DIR=/data/uploads).
   # Set AWS_S3_BUCKET to switch to S3-compatible storage. When set, UPLOADS_DIR is ignored.
   #
   # AWS S3:
   #   AWS_S3_BUCKET=planly-uploads
   #   AWS_REGION=us-east-1
   #   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   #   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   #
   # Scaleway Object Storage:
   #   AWS_S3_BUCKET=planly-uploads
   #   AWS_REGION=nl-ams-1                           # or fr-par-1, pl-waw-1
   #   AWS_ENDPOINT_URL=https://s3.nl-ams.scw.cloud
   #   AWS_ACCESS_KEY_ID=<Scaleway access key ID>
   #   AWS_SECRET_ACCESS_KEY=<Scaleway secret key>
   #
   # Self-hosted MinIO (see commented-out MinIO block in docker-compose.yml):
   #   AWS_S3_BUCKET=planly
   #   AWS_REGION=us-east-1
   #   AWS_ENDPOINT_URL=http://minio:9000
   #   AWS_ACCESS_KEY_ID=planly
   #   AWS_SECRET_ACCESS_KEY=changeme
   #
   # Optional: prefix for all stored files (default: planly-uploads)
   # AWS_S3_PREFIX=planly-uploads
   ```

2. `docker-compose.yml` — add the `AWS_*` env vars to the backend service (all commented out, sourced from `.env`):

   ```yaml
   # ── File uploads: S3-compatible object storage (optional) ───────────────
   # Set AWS_S3_BUCKET in .env to activate S3 mode (see .env.example).
   # AWS_S3_BUCKET: ${AWS_S3_BUCKET}
   # AWS_REGION: ${AWS_REGION}
   # AWS_ENDPOINT_URL: ${AWS_ENDPOINT_URL}
   # AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
   # AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
   # AWS_S3_PREFIX: ${AWS_S3_PREFIX}
   ```

**To use Scaleway Object Storage:**
1. Create a bucket in your Scaleway project (Private ACL, same region as your server)
2. Generate an API key scoped to Object Storage
3. Add the env vars above to `.env` on the server
4. Restart with `docker compose up --build --force-recreate`

**To use MinIO locally:** uncomment the MinIO block in `docker-compose.yml` (already there) and set the `AWS_*` vars above.

---

## Part 2 — Frontend K8s replicas (nginx envsubst)

The frontend is a static SPA served by Nginx — it is already stateless. Multiple replicas are trivially supported. The only blocker is the hardcoded backend URL.

**What changes:**

### 1. `frontend/nginx.conf.template` (new file)

Copy of `nginx.conf` with one change on the `proxy_pass` line:

```nginx
# in nginx.conf.template:
proxy_pass ${BACKEND_URL};
# was: proxy_pass http://backend:3000;
```

All other nginx variables (`$host`, `$remote_addr`, etc.) are NOT affected because `envsubst` will only be told to substitute `$BACKEND_URL`.

### 2. `frontend/Dockerfile` (3 lines changed)

```dockerfile
FROM node:20-alpine@sha256:... AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM nginx:alpine@sha256:...
COPY --from=builder /app/dist /usr/share/nginx/html
# Changed: copy template instead of the static config
COPY nginx.conf.template /etc/nginx/nginx.conf.template
# Changed: default value for Docker Compose (no .env change needed)
ENV BACKEND_URL=http://backend:3000
# Changed: envsubst at container start, then launch nginx
CMD ["/bin/sh", "-c", "envsubst '$BACKEND_URL' < /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf && exec nginx -g 'daemon off;'"]
EXPOSE 80
```

**Why single-quotes around `'$BACKEND_URL'`:** tells the shell not to expand it, so `envsubst` receives the literal string `$BACKEND_URL` and only substitutes that variable — nginx's own `$host`, `$uri`, etc. are left untouched.

### 3. No change to `docker-compose.yml`

The default `ENV BACKEND_URL=http://backend:3000` in the Dockerfile matches the current service name, so Docker Compose continues to work without any `.env` entry.

To override (e.g. for a staging stack with a different backend name):

```bash
# in .env or docker-compose.override.yml
BACKEND_URL=http://planly-backend:3000
```

---

## Optional: K8s example manifests

These are reference YAMLs to drop into a `deploy/k8s/` directory. Not required for the Docker Compose workflow.

### `deploy/k8s/backend.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: planly-backend
spec:
  replicas: 1          # keep at 1 until Redis pub/sub is added for WebSocket fan-out
  selector:
    matchLabels:
      app: planly-backend
  template:
    metadata:
      labels:
        app: planly-backend
    spec:
      containers:
        - name: backend
          image: ghcr.io/yourorg/planly-backend:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: planly-secrets   # DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, AWS_*, etc.
          env:
            - name: UPLOADS_DIR
              value: /data/uploads
          volumeMounts:
            - name: uploads
              mountPath: /data/uploads
      volumes:
        - name: uploads
          persistentVolumeClaim:
            claimName: planly-uploads
---
apiVersion: v1
kind: Service
metadata:
  name: planly-backend
spec:
  selector:
    app: planly-backend
  ports:
    - port: 3000
      targetPort: 3000
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: planly-uploads
spec:
  accessModes:
    - ReadWriteOnce     # one node; use ReadWriteMany (NFS/EFS) if backend scales >1
  resources:
    requests:
      storage: 10Gi
```

### `deploy/k8s/frontend.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: planly-frontend
spec:
  replicas: 2          # stateless SPA — scale freely
  selector:
    matchLabels:
      app: planly-frontend
  template:
    metadata:
      labels:
        app: planly-frontend
    spec:
      containers:
        - name: frontend
          image: ghcr.io/yourorg/planly-frontend:latest
          ports:
            - containerPort: 80
          env:
            - name: BACKEND_URL
              value: http://planly-backend:3000
---
apiVersion: v1
kind: Service
metadata:
  name: planly-frontend
spec:
  selector:
    app: planly-frontend
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: planly
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  rules:
    - host: planly.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: planly-frontend
                port:
                  number: 80
```

> Note: With this Ingress, `/api/` is handled by nginx inside the frontend pod, which proxies to the backend service. That's the same flow as Docker Compose. Alternatively, split the Ingress so `/api/` routes directly to the backend service (bypasses nginx's proxy layer, reduces one hop).

---

## What is NOT in scope

**Backend WebSocket multi-replica** — a second backend pod would not receive real-time events fired from the first pod. This requires a Redis pub/sub layer (`redis.ts` with `REDIS_URL`). The `docker-compose.yml` already has a commented-out Redis block. This is medium-high effort and was not requested.

---

## Implementation order

| Step | File(s) | Time |
|---|---|---|
| 1. Bind mount | `docker-compose.yml`, `.gitignore`, `mkdir data/uploads` | ~5 min |
| 2. S3 docs | `.env.example`, `docker-compose.yml` (env block) | ~5 min |
| 3. nginx template | `frontend/nginx.conf.template` (new), `frontend/Dockerfile` | ~10 min |
| 4. K8s YAMLs (optional) | `deploy/k8s/*.yaml` (new) | ~20 min |

Steps 1–3 are independent and can be done in any order. Step 4 is optional and only needed if targeting K8s now.
