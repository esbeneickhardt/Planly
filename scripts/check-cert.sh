#!/usr/bin/env sh
# check-cert.sh — TLS certificate expiry alert.
#
# Reads the Let's Encrypt certificate from Traefik's acme.json, checks the
# expiry date, and sends a POST to SECURITY_ALERT_WEBHOOK_URL if the cert
# will expire within CERT_WARN_DAYS (default: 14).
#
# Designed to run inside the cert-checker Docker service on a daily schedule.
# Can also be invoked manually:
#
#   DOMAIN=planly.example.com \
#   SECURITY_ALERT_WEBHOOK_URL=https://hooks.slack.com/... \
#   bash scripts/check-cert.sh
#
# Required env:
#   DOMAIN                        — the HTTPS domain to check
#   ACME_FILE                     — path to acme.json (default: /letsencrypt/acme.json)
# Optional env:
#   SECURITY_ALERT_WEBHOOK_URL    — Slack / Discord / generic JSON webhook; alert is skipped if unset
#   CERT_WARN_DAYS                — days before expiry to start alerting (default: 14)

set -eu

DOMAIN="${DOMAIN:-}"
ACME_FILE="${ACME_FILE:-/letsencrypt/acme.json}"
WARN_DAYS="${CERT_WARN_DAYS:-14}"
WARN_SECONDS=$((WARN_DAYS * 86400))
WEBHOOK="${SECURITY_ALERT_WEBHOOK_URL:-}"

if [ -z "$DOMAIN" ]; then
  echo "[cert-check] ERROR: DOMAIN is not set" >&2
  exit 1
fi

# ── Extract the certificate PEM from acme.json ─────────────────────────────
# Traefik stores the cert as a base64-encoded DER blob under
# .le.Certificates[].certificate for the matching domain.
if [ ! -f "$ACME_FILE" ]; then
  echo "[cert-check] acme.json not found at $ACME_FILE — Traefik may not have issued a cert yet"
  exit 0
fi

CERT_B64=$(cat "$ACME_FILE" | python3 -c "
import json, sys
data = json.load(sys.stdin)
certs = data.get('le', {}).get('Certificates', []) or []
for c in certs:
    domains = c.get('domain', {})
    main = domains.get('main', '')
    sans = domains.get('sans', []) or []
    if main == '$DOMAIN' or '$DOMAIN' in sans:
        print(c.get('certificate', ''))
        break
" 2>/dev/null)

if [ -z "$CERT_B64" ]; then
  echo "[cert-check] No certificate found in acme.json for domain: $DOMAIN"
  # Not alerting — Traefik may still be in the process of obtaining the cert
  exit 0
fi

# ── Parse expiry date ───────────────────────────────────────────────────────
# Decode base64 → DER, convert DER → PEM, then read the Not After field
EXPIRY_STR=$(printf '%s' "$CERT_B64" | base64 -d | openssl x509 -inform DER -noout -enddate 2>/dev/null | cut -d= -f2)

if [ -z "$EXPIRY_STR" ]; then
  echo "[cert-check] Could not parse certificate expiry date" >&2
  exit 1
fi

# Convert expiry to epoch seconds
EXPIRY_EPOCH=$(date -d "$EXPIRY_STR" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY_STR" +%s 2>/dev/null || echo "0")
NOW_EPOCH=$(date +%s)
SECONDS_LEFT=$((EXPIRY_EPOCH - NOW_EPOCH))
DAYS_LEFT=$((SECONDS_LEFT / 86400))

echo "[cert-check] $DOMAIN: certificate expires in $DAYS_LEFT days ($EXPIRY_STR)"

# ── Send alert if within the warning window ─────────────────────────────────
if [ "$SECONDS_LEFT" -le "$WARN_SECONDS" ]; then
  echo "[cert-check] WARNING: Certificate expires in $DAYS_LEFT days — sending alert"

  if [ -n "$WEBHOOK" ]; then
    # Works with Slack incoming webhooks, Discord webhooks, and any JSON POST endpoint
    MSG="⚠️ *TLS certificate expiry warning* — \`$DOMAIN\` cert expires in *$DAYS_LEFT days* ($EXPIRY_STR). Check Traefik logs and ensure Let's Encrypt auto-renewal is running."
    curl -sf -X POST "$WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"$MSG\"}" \
      > /dev/null && echo "[cert-check] Alert sent to webhook" \
      || echo "[cert-check] WARNING: Failed to send webhook alert" >&2
  else
    echo "[cert-check] SECURITY_ALERT_WEBHOOK_URL is not set — alert not sent. Set it to receive notifications."
  fi
else
  echo "[cert-check] Certificate is healthy ($DAYS_LEFT days remaining)"
fi
