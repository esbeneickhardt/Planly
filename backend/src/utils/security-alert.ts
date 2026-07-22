/**
 * Security alerting - sends a POST to SECURITY_ALERT_WEBHOOK_URL when
 * a high-severity security event occurs (account lockout, etc.).
 *
 * Configure in .env: SECURITY_ALERT_WEBHOOK_URL=https://hooks.slack.com/...
 * Any HTTP endpoint that accepts a JSON body works (Slack, Discord, custom webhook).
 */

// Not configured → silently no-op; alerting is optional
const WEBHOOK_URL = process.env.SECURITY_ALERT_WEBHOOK_URL;

export type SecurityAlertPayload = { event: string; account: string; ip: string; timestamp: string } & Record<
  string,
  unknown
>;

export async function sendSecurityAlert(payload: SecurityAlertPayload) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Alerting must never crash the server
  }
}
