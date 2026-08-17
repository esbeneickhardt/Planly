/**
 * Per-product analytics: summary stats/velocity (`get`), the paginated activity feed
 * (`activity`), and workload breakdown (`workload`).
 */

import { request } from '../httpClient';

export const analytics = {
  get: (productId: string) =>
    request<{
      tasksByDay: { date: string; count: number }[];
      cycleTimeAvgDays: number | null;
      totalCompleted: number;
      totalActive: number;
      statusBreakdown: { status: string; count: number }[];
      sprintVelocity: {
        sprintId: string;
        name: string;
        startDate: string;
        endDate: string;
        color: string;
        completed: number;
      }[];
    }>(`/api/products/${productId}/analytics`),
  activity: (productId: string, cursor?: string) =>
    request<{
      events: {
        id: string;
        actorId: string;
        action: string;
        entityType: string;
        entityId: string | null;
        entityName: string | null;
        metadata: unknown;
        createdAt: string;
      }[];
      nextCursor: string | null;
    }>(`/api/products/${productId}/activity${cursor ? `?cursor=${cursor}` : ''}`),
  workload: (productId: string) =>
    request<{
      statusBreakdown: { status: string; count: number }[];
      totalActive: number;
      totalCompleted: number;
      completionsByDay: { date: string; count: number }[];
    }>(`/api/products/${productId}/analytics/workload`),
};
