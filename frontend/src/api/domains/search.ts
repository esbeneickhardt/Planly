/**
 * Global search across tasks/messages/etc, optionally scoped to a single product.
 */

import { request } from '../httpClient';
import type { SearchResults } from '../types';

export const search = (q: string, productId?: string) =>
  request<SearchResults>(`/api/search?q=${encodeURIComponent(q)}${productId ? `&productId=${productId}` : ''}`);
