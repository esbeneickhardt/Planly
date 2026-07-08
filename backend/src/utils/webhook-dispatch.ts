/**
 * Webhook dispatch — fans out event payloads to all active webhooks for a project.
 *
 * Each delivery is attempted in parallel with an 8-second timeout. Failures (network
 * errors, non-2xx responses, timeouts) are recorded in WebhookDelivery but do not
 * throw — a failed delivery must never break the request that triggered it.
 *
 * Payloads are signed with HMAC-SHA256 using the webhook's encrypted secret.
 * The signature is sent as `X-Planly-Signature: sha256=<hex>` for receivers to verify.
 */
import { createHmac } from 'crypto';
import prisma from '../db/client';
import { decryptValue } from './crypto';
import { logger } from './logger';

/**
 * Dispatches `event` to all active webhooks in `productId` that subscribe to it.
 *
 * @param productId - Project whose webhooks to fan out to
 * @param event - Event name (e.g. 'task.created')
 * @param payload - Event-specific data included in the JSON body
 */
export async function dispatchWebhooks(productId: string, event: string, payload: object) {
  const webhooks = await prisma.webhook.findMany({
    where: { productId, active: true, events: { has: event } },
  });
  if (webhooks.length === 0) return;

  await Promise.allSettled(
    webhooks.map(async (wh) => {
      const body = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
      const sig = createHmac('sha256', decryptValue(wh.secret)).update(body).digest('hex');
      let statusCode: number | undefined;
      let responseBody: string | undefined;
      let success = false;
      try {
        const res = await fetch(wh.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Planly-Signature': `sha256=${sig}`,
            'X-Planly-Event': event,
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        statusCode = res.status;
        responseBody = (await res.text()).slice(0, 1000);
        success = res.ok;
      } catch (err) {
        responseBody = (err as Error).message.slice(0, 500);
      }
      await prisma.webhookDelivery.create({
        data: { webhookId: wh.id, event, payload, statusCode, responseBody, success },
      }).catch((err) => {
        logger.warn({ err: (err as Error).message, webhookId: wh.id, event }, 'webhook delivery record failed');
      });
    }),
  );
}
