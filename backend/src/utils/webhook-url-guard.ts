/**
 * Webhook URL SSRF guard — validates that a webhook destination URL points to
 * a public internet address and not to any private, loopback, or reserved range.
 *
 * Called before persisting any webhook URL (create and update) to prevent an
 * attacker from registering a webhook that probes internal services (SSRF).
 *
 * Checks:
 *  - URL scheme must be http or https
 *  - If the hostname is a bare IPv4/IPv6 address, it's validated directly
 *  - Otherwise the hostname is resolved via DNS; the resolved IP is then validated
 *
 * Private ranges blocked: RFC 1918, loopback, link-local, CGNAT, test-nets,
 * broadcast, multicast, and their IPv6 equivalents.
 */
import { promises as dns } from 'dns';
import { isIPv4, isIPv6 } from 'net';

// Blocks SSRF via webhook URLs by resolving the hostname and rejecting private/reserved ranges.
// Called before persisting any webhook URL (create and update).

interface Ipv4Parts { a: number; b: number; c: number; d: number }

function parseIpv4(ip: string): Ipv4Parts | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  const [a, b, c, d] = parts as [number, number, number, number];
  return { a, b, c, d };
}

function isPrivateIpv4(ip: string): boolean {
  const p = parseIpv4(ip);
  if (!p) return true; // can't parse → block by default
  const { a, b, c, d } = p;
  return (
    a === 127 ||                                               // 127.0.0.0/8  loopback
    a === 10 ||                                                // 10.0.0.0/8   private
    (a === 172 && b >= 16 && b <= 31) ||                       // 172.16.0.0/12 private
    (a === 192 && b === 168) ||                                // 192.168.0.0/16 private
    (a === 169 && b === 254) ||                                // 169.254.0.0/16 link-local / metadata
    (a === 100 && (b & 0xc0) === 64) ||                       // 100.64.0.0/10  CGNAT
    a === 0 ||                                                 // 0.0.0.0/8     this-network
    (a === 192 && b === 0 && c === 2) ||                       // 192.0.2.0/24  TEST-NET-1
    (a === 198 && b === 51 && c === 100) ||                    // 198.51.100.0/24 TEST-NET-2
    (a === 203 && b === 0 && c === 113) ||                     // 203.0.113.0/24 TEST-NET-3
    (a === 255 && b === 255 && c === 255 && d === 255) ||      // broadcast
    (a >= 224)                                                 // 224.0.0.0/3   multicast + reserved
  );
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    lower === '::1' ||                                  // loopback
    lower.startsWith('fe80:') ||                        // fe80::/10 link-local
    lower.startsWith('fc') ||                           // fc00::/7  unique local
    lower.startsWith('fd') ||                           //   (continuation)
    lower.startsWith('::ffff:127.') ||                  // IPv4-mapped loopback
    lower === '::' ||                                   // unspecified
    lower.startsWith('ff')                              // multicast
  );
}

/**
 * Validates a webhook URL for SSRF safety.
 *
 * @returns An error string describing the problem, or null if the URL is safe.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'Invalid URL';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Webhook URL must use http or https';
  }

  const hostname = parsed.hostname;

  // Block bare IPs immediately without DNS resolution
  if (isIPv4(hostname)) {
    if (isPrivateIpv4(hostname)) return 'Webhook URL must point to a public internet address';
    return null; // valid public IPv4
  }
  if (isIPv6(hostname.replace(/^\[|\]$/g, ''))) {
    if (isPrivateIpv6(hostname)) return 'Webhook URL must point to a public internet address';
    return null; // valid public IPv6
  }

  // Resolve hostname → catch DNS rebinding / internal hostnames
  try {
    const { address, family } = await dns.lookup(hostname);
    if (family === 4 && isPrivateIpv4(address)) {
      return 'Webhook URL resolves to a private or reserved address';
    }
    if (family === 6 && isPrivateIpv6(address)) {
      return 'Webhook URL resolves to a private or reserved address';
    }
  } catch {
    return 'Webhook URL hostname could not be resolved';
  }

  return null; // valid
}
