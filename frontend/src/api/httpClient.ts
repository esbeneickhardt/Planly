/**
 * Shared fetch wrapper used by every domain file in `api/domains/` - CSRF token injection,
 * transparent 401-refresh-and-retry, and typed error parsing all live here exactly once so
 * every domain stays a thin, stateless list of endpoint functions.
 *
 *   - Sends cookies with every request (credentials: 'include')
 *   - Reads the non-httpOnly `csrf` cookie and adds it as X-CSRF-Token on
 *     all mutating methods (POST, PUT, PATCH, DELETE)
 *   - Parses error responses and throws a typed Error with the status code
 *   - Dispatches a 'planly:email-not-verified' custom event on 403 so the UI
 *     can prompt the user to verify their email without coupling every caller
 */

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function getCsrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith('csrf='))
    ?.split('=')[1];
}

// Deduplicates concurrent refresh attempts — if multiple requests 401 simultaneously,
// only one refresh is fired; all others await the same promise.
let _refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!_refreshPromise) {
    _refreshPromise = fetch('/api/auth/refresh-token', {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        _refreshPromise = null;
      });
  }
  return _refreshPromise;
}

export async function request<T>(path: string, init?: RequestInit & { _retry?: boolean }): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const csrfHeaders: Record<string, string> = {};
  if (MUTATING.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) csrfHeaders['X-CSRF-Token'] = csrf;
  }
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...csrfHeaders,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Attempt a transparent refresh once before surfacing the 401 to the user.
      // _retry guard prevents infinite loops; skip for the refresh endpoint itself.
      if (!init?._retry && path !== '/api/auth/refresh-token') {
        const refreshed = await tryRefresh();
        if (refreshed) return request<T>(path, { ...init, _retry: true });
      }
      window.dispatchEvent(new CustomEvent('planly:session-expired'));
    }
    if (res.status === 403 && (body as { code?: string }).code === 'EMAIL_NOT_VERIFIED') {
      window.dispatchEvent(new CustomEvent('planly:email-not-verified'));
    }
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

export const json = (body: unknown) => JSON.stringify(body);
