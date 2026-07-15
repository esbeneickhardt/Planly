// Pure IP utility helpers shared by the global user IP restriction hook and the requireAdmin middleware
import { isIPv4 } from 'net';
import { config } from '../config/env';

// Convert a dotted-decimal IPv4 address to a 32-bit unsigned integer for CIDR masking
function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0) >>> 0;
}

// Returns true if clientIp falls within the given CIDR range (or matches exactly for non-CIDR entries)
export function matchesCidr(clientIp: string, cidr: string): boolean {
  const ip = clientIp.startsWith('::ffff:') ? clientIp.slice(7) : clientIp;

  if (!cidr.includes('/')) return ip === cidr;

  const [network, prefixStr] = cidr.split('/') as [string, string];
  const prefix = parseInt(prefixStr, 10);

  if (!isIPv4(ip) || !isIPv4(network)) return false;
  if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}

// Extracts the real client IP from X-Forwarded-For, accounting for the configured proxy depth
export function getClientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const raw = process.env.TRUSTED_PROXY_DEPTH;
  const depth = raw === undefined ? config.trustedProxyDepth : parseInt(raw, 10);

  if (depth <= 0) return req.socket.remoteAddress ?? '';

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length > 0) {
      // Proxies append to the right; the client IP sits depth entries from the right
      const idx = Math.max(0, list.length - depth);
      return list[idx] ?? '';
    }
  }
  return req.socket.remoteAddress ?? '';
}

// Returns true for loopback addresses that should always be allowed through IP restriction checks
export function isLocalhost(ip: string): boolean {
  return !ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
