import { createHmac } from 'crypto';
import prisma from '../db/client';
import { decryptValue } from './crypto';

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
        console.warn('[webhook-dispatch] Failed to record delivery:', (err as Error).message);
      });
    }),
  );
}
