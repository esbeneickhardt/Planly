/**
 * CRUD for saved canvas view snapshots (node positions + viewport) on a product.
 */

import { request, json } from '../httpClient';
import type { CanvasSnapshot, CanvasSnapshotViewport } from '../types';

export const canvasSnapshots = {
  list: (productId: string) => request<CanvasSnapshot[]>(`/api/products/${productId}/canvas-snapshots`),
  create: (
    productId: string,
    data: { name: string; positions: Record<string, { x: number; y: number }>; viewport: CanvasSnapshotViewport },
  ) => request<CanvasSnapshot>(`/api/products/${productId}/canvas-snapshots`, { method: 'POST', body: json(data) }),
  update: (
    productId: string,
    snapshotId: string,
    data: {
      name?: string;
      positions: Record<string, { x: number; y: number }>;
      viewport: CanvasSnapshotViewport;
    },
  ) =>
    request<CanvasSnapshot>(`/api/products/${productId}/canvas-snapshots/${snapshotId}`, {
      method: 'PATCH',
      body: json(data),
    }),
  delete: (productId: string, snapshotId: string) =>
    request<{ ok: boolean }>(`/api/products/${productId}/canvas-snapshots/${snapshotId}`, { method: 'DELETE' }),
};
