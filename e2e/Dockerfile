FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /e2e

COPY package.json package-lock.json ./
RUN npm ci

# Specs, fixtures, and config are mounted at runtime - no COPY needed.
# This means spec changes are picked up without a rebuild.
