/**
 * Per-product color legend entries: list and full replace.
 */

import { request, json } from '../httpClient';
import type { ColorLegendEntryResult } from '../types';

export const colorLegend = {
  list: (productId: string) => request<ColorLegendEntryResult[]>(`/api/products/${productId}/color-legend`),
  update: (productId: string, entries: ColorLegendEntryResult[]) =>
    request<{ ok: boolean }>(`/api/products/${productId}/color-legend`, {
      method: 'PUT',
      body: json(entries),
    }),
};
