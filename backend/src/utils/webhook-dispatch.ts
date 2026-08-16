/**
 * Webhook dispatch - fans out event payloads to all active webhooks for a project.
 *
 * Each delivery is attempted in parallel with an 8-second timeout. Failures (network
 * errors, non-2xx responses, timeouts) are recorded in WebhookDelivery but do not
 * throw - a failed delivery must never break the request that triggered it.
 *
 * Payloads are signed with HMAC-SHA256 using the webhook's encrypted secret.
 * The signature is sent as `X-Planly-Signature: sha256=<hex>` for receivers to verify.
 */
import type { Webhook } from '@prisma/client';
import { createHmac } from 'crypto';
import prisma from '../db/client';
import { decryptValue } from './crypto';
import { logger } from './logger';
import { validateWebhookUrl } from './webhook-url-guard';

/**
 * Dispatches `event` to all active webhooks in `productId` that subscribe to it.
 *
 * @param productId - Project whose webhooks to fan out to
 * @param event - Event name (e.g. 'task.created')
 * @param payload - Event-specific data included in the JSON body
 */
export async function dispatchWebhooks(productId: string, event: string, payload: object) {
  // Fetch only active webhooks that explicitly subscribe to this event
  const webhooks = await prisma.webhook.findMany({
    where: { productId, active: true, events: { has: event } },
  });
  if (webhooks.length === 0) return;

  // Fan out to all matching endpoints in parallel; allSettled so one failure doesn't cancel others
  await Promise.allSettled(webhooks.map((wh) => deliverToWebhook(wh, event, payload)));
}

/**
 * Same as dispatchWebhooks, but for firing the same event with N different payloads to the same
 * project's webhooks (e.g. a bulk task update/delete looping over affected tasks) - the webhook
 * list is fetched once for the whole batch instead of once per payload, which is what a loop
 * calling dispatchWebhooks per-item would otherwise do. Every (webhook, payload) pair is still
 * delivered and recorded independently, exactly as if dispatchWebhooks had been called once per
 * payload - this only removes the redundant repeated `webhook.findMany` query.
 *
 * @param productId - Project whose webhooks to fan out to
 * @param event - Event name shared by every payload in this batch (e.g. 'task.status_changed')
 * @param payloads - One JSON body per affected entity
 */
export async function dispatchWebhooksBatch(productId: string, event: string, payloads: object[]) {
  if (payloads.length === 0) return;
  const webhooks = await prisma.webhook.findMany({
    where: { productId, active: true, events: { has: event } },
  });
  if (webhooks.length === 0) return;

  await Promise.allSettled(
    webhooks.flatMap((wh) => payloads.map((payload) => deliverToWebhook(wh, event, payload))),
  );
}

// Delivers one event payload to one webhook and records the outcome. Never throws - all failure
// modes (SSRF re-check, network error, non-2xx, redirect) resolve to a recorded, unsuccessful
// WebhookDelivery row instead.
async function deliverToWebhook(wh: Webhook, event: string, payload: object): Promise<void> {
  const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  // Sign the serialized body with HMAC-SHA256 using the decrypted per-webhook secret
  const sig = createHmac('sha256', decryptValue(wh.secret)).update(body).digest('hex');
  let statusCode: number | undefined;
  let responseBody: string | undefined;
  let success = false;
  try {
    // Re-validate at delivery time to catch DNS rebinding: the hostname could have been
    // re-pointed to a private IP after the webhook was created and passed the write-time check
    const ssrfError = await validateWebhookUrl(wh.url);
    if (ssrfError) {
      logger.warn(
        { webhookId: wh.id, url: wh.url, reason: ssrfError },
        'webhook delivery blocked: SSRF re-check failed',
      );
      await prisma.webhookDelivery
        .create({
          data: {
            webhookId: wh.id,
            event,
            payload,
            statusCode: null,
            responseBody: `Blocked: ${ssrfError}`,
            success: false,
          },
        })
        .catch(() => {});
      return;
    }
    const res = await fetch(wh.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Planly-Signature': `sha256=${sig}`,
        'X-Planly-Event': event,
      },
      body,
      signal: AbortSignal.timeout(8000),
      // Never auto-follow redirects: the SSRF guard above only validates wh.url itself,
      // and a redirect target (e.g. to a private IP) would bypass it entirely. Treat any
      // redirect response as a failed delivery instead of letting fetch chase it.
      redirect: 'manual',
    });
    statusCode = res.status;
    if (res.status >= 300 && res.status < 400) {
      logger.warn(
        { webhookId: wh.id, url: wh.url, status: res.status, location: res.headers.get('location') ?? undefined },
        'webhook delivery blocked: redirect responses are not followed',
      );
      responseBody = `Blocked: redirect response (${res.status}) not followed`;
      success = false;
    } else {
      // Truncate to avoid storing arbitrarily large error responses
      responseBody = (await res.text()).slice(0, 1000);
      success = res.ok;
    }
  } catch (err) {
    responseBody = (err as Error).message.slice(0, 500);
  }
  // Record the delivery outcome regardless of success or failure
  await prisma.webhookDelivery
    .create({
      data: { webhookId: wh.id, event, payload, statusCode, responseBody, success },
    })
    .catch((err) => {
      logger.warn({ err: (err as Error).message, webhookId: wh.id, event }, 'webhook delivery record failed');
    });
}
