/**
 * Unit tests for IP restriction helpers.
 *
 * matchesCidr — checks whether a client IP falls within an allow/deny CIDR range.
 * getClientIp — extracts the real client IP from X-Forwarded-For, honoring
 *               TRUSTED_PROXY_DEPTH to skip trusted intermediate proxies.
 *
 * These are pure functions with no DB or network calls.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getClientIp, matchesCidr } from '../../routes/ip-restrictions';

// ── matchesCidr ────────────────────────────────────────────────────────────

describe('matchesCidr', () => {
  it('matches an exact IPv4 address', () => {
    expect(matchesCidr('192.168.1.100', '192.168.1.100')).toBe(true);
  });

  it('does not match a different IPv4 address', () => {
    expect(matchesCidr('192.168.1.101', '192.168.1.100')).toBe(false);
  });

  it('matches an IP within a /24 subnet', () => {
    expect(matchesCidr('192.168.1.200', '192.168.1.0/24')).toBe(true);
  });

  it('does not match an IP outside a /24 subnet', () => {
    expect(matchesCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('matches with /32 (single host)', () => {
    expect(matchesCidr('10.0.0.1', '10.0.0.1/32')).toBe(true);
    expect(matchesCidr('10.0.0.2', '10.0.0.1/32')).toBe(false);
  });

  it('matches with /0 (any IP)', () => {
    expect(matchesCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
    expect(matchesCidr('255.255.255.255', '0.0.0.0/0')).toBe(true);
  });

  it('strips IPv6-mapped IPv4 prefix before matching', () => {
    expect(matchesCidr('::ffff:192.168.1.5', '192.168.1.0/24')).toBe(true);
  });

  it('matches an exact IPv6 address', () => {
    expect(matchesCidr('::1', '::1')).toBe(true);
    expect(matchesCidr('::2', '::1')).toBe(false);
  });

  it('returns false for IPv6 CIDR notation (not supported)', () => {
    expect(matchesCidr('2001:db8::1', '2001:db8::/32')).toBe(false);
  });
});

// ── getClientIp ────────────────────────────────────────────────────────────

function makeReq(xff: string | undefined, remoteAddress = '10.0.0.1') {
  return {
    headers: xff ? { 'x-forwarded-for': xff } : {},
    socket: { remoteAddress },
  };
}

describe('getClientIp', () => {
  const origDepth = process.env.TRUSTED_PROXY_DEPTH;

  beforeEach(() => {
    delete process.env.TRUSTED_PROXY_DEPTH;
  });
  afterEach(() => {
    if (origDepth === undefined) delete process.env.TRUSTED_PROXY_DEPTH;
    else process.env.TRUSTED_PROXY_DEPTH = origDepth;
  });

  it('returns socket remoteAddress when no XFF header is present', () => {
    expect(getClientIp(makeReq(undefined, '203.0.113.5'))).toBe('203.0.113.5');
  });

  it('returns the correct IP with depth=1 (default) and a single XFF entry', () => {
    // One proxy added clientIp → XFF: clientIp, depth=1 → list[0]
    expect(getClientIp(makeReq('1.2.3.4'))).toBe('1.2.3.4');
  });

  it('returns the Nth-from-right IP with depth=1 when XFF has multiple hops', () => {
    // Attacker prepends a fake IP; our proxy appended the real client
    // XFF: fakeIp, realClientIp  → depth=1 → realClientIp
    expect(getClientIp(makeReq('5.5.5.5, 1.2.3.4'))).toBe('1.2.3.4');
  });

  it('uses depth=2 to skip an intermediate trusted proxy', () => {
    process.env.TRUSTED_PROXY_DEPTH = '2';
    // XFF: clientIp, proxy1Ip → depth=2 → clientIp (index 0)
    expect(getClientIp(makeReq('1.2.3.4, 172.16.0.1'))).toBe('1.2.3.4');
  });

  it('falls back to leftmost entry when XFF has fewer entries than depth', () => {
    process.env.TRUSTED_PROXY_DEPTH = '3';
    expect(getClientIp(makeReq('1.2.3.4'))).toBe('1.2.3.4');
  });

  it('ignores XFF completely when depth=0', () => {
    process.env.TRUSTED_PROXY_DEPTH = '0';
    expect(getClientIp(makeReq('5.5.5.5', '203.0.113.1'))).toBe('203.0.113.1');
  });

  it('handles XFF as an array (multiple header values)', () => {
    const req = {
      headers: { 'x-forwarded-for': ['1.2.3.4', '5.6.7.8'] as string[] },
      socket: { remoteAddress: '10.0.0.1' },
    };
    // Joined: "1.2.3.4, 5.6.7.8", depth=1 → 5.6.7.8
    expect(getClientIp(req as never)).toBe('5.6.7.8');
  });

  it('trims whitespace from IP addresses', () => {
    expect(getClientIp(makeReq('  1.2.3.4  '))).toBe('1.2.3.4');
  });
});
