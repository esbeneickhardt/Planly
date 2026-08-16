/**
 * Unit tests for the webhook delivery SSRF-via-redirect guard (src/utils/webhook-dispatch.ts).
 *
 * Node's global fetch defaults to redirect: 'follow', which would let a webhook target respond
 * with a 3xx pointing at a private/internal address and have the server transparently fetch it -
 * completely bypassing validateWebhookUrl's SSRF check, which only ever validates the webhook's
 * OWN configured URL, never a redirect target. dispatchWebhooks must pass redirect: 'manual' and
 * treat any 3xx response as a failed delivery instead of letting fetch chase it.
 *
 * prisma and validateWebhookUrl are mocked so this runs without a database or network access;
 * global fetch is mocked to simulate a malicious/compromised webhook endpoint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWebhookFindMany = vi.fn();
const mockWebhookDeliveryCreate = vi.fn().mockResolvedValue({});

vi.mock('../../db/client', () => ({
  default: {
    webhook: { findMany: (...args: unknown[]) => mockWebhookFindMany(...args) },
    webhookDelivery: { create: (...args: unknown[]) => mockWebhookDeliveryCreate(...args) },
  },
}));

// The write-time/DNS-rebinding SSRF check on the webhook's OWN url - always "passes" here so the
// test isolates the separate redirect-following gap, not this check.
const mockValidateWebhookUrl = vi.fn().mockResolvedValue(null);
vi.mock('../../utils/webhook-url-guard', () => ({
  validateWebhookUrl: (...args: unknown[]) => mockValidateWebhookUrl(...args),
}));

const FAKE_WEBHOOK = {
  id: 'wh-1',
  productId: 'prod-1',
  url: 'https://attacker-controlled.example.com/hook',
  // decryptValue() gracefully returns non-"iv:tag:cipher"-shaped strings unchanged, so a plain
  // string here is enough to exercise HMAC signing without real encryption.
  secret: 'plain-test-secret',
  events: ['task.created'],
  active: true,
  createdAt: new Date(),
};

describe('dispatchWebhooks - SSRF via redirect-following', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWebhookFindMany.mockResolvedValue([FAKE_WEBHOOK]);
    mockWebhookDeliveryCreate.mockResolvedValue({});
    mockValidateWebhookUrl.mockResolvedValue(null);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('passes redirect: "manual" so fetch never auto-follows a redirect response', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => 'ok',
    });

    const { dispatchWebhooks } = await import('../../utils/webhook-dispatch');
    await dispatchWebhooks('prod-1', 'task.created', { id: 'task-1' });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.redirect).toBe('manual');
  });

  it('treats a 302 pointing at a private IP as a failed delivery instead of following it', async () => {
    // Simulates a webhook endpoint that responds with a redirect to the cloud metadata address -
    // a classic SSRF pivot. With redirect: 'manual', fetch surfaces this as an opaque redirect
    // response rather than transparently issuing a second request to that address.
    fetchMock.mockResolvedValue({
      status: 302,
      ok: false,
      headers: { get: (name: string) => (name.toLowerCase() === 'location' ? 'http://169.254.169.254/latest/meta-data/' : null) },
      text: async () => '',
    });

    const { dispatchWebhooks } = await import('../../utils/webhook-dispatch');
    await dispatchWebhooks('prod-1', 'task.created', { id: 'task-1' });

    // Exactly one request - proves nothing followed the redirect to the internal address.
    expect(fetchMock).toHaveBeenCalledOnce();

    // The delivery must be recorded as a failure, not silently treated as success.
    expect(mockWebhookDeliveryCreate).toHaveBeenCalledOnce();
    const recorded = mockWebhookDeliveryCreate.mock.calls[0]?.[0]?.data;
    expect(recorded.success).toBe(false);
    expect(recorded.statusCode).toBe(302);
    expect(String(recorded.responseBody)).toMatch(/redirect/i);
  });

  it('still records a normal 2xx delivery as successful (no change to non-redirect behavior)', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: { get: () => null },
      text: async () => '{"received":true}',
    });

    const { dispatchWebhooks } = await import('../../utils/webhook-dispatch');
    await dispatchWebhooks('prod-1', 'task.created', { id: 'task-1' });

    expect(mockWebhookDeliveryCreate).toHaveBeenCalledOnce();
    const recorded = mockWebhookDeliveryCreate.mock.calls[0]?.[0]?.data;
    expect(recorded.success).toBe(true);
    expect(recorded.statusCode).toBe(200);
  });
});
