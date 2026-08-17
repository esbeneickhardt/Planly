import { request } from '../httpClient';
import type { Product } from '../../types';
import type { MilestoneResult } from '../types';

export const milestones = {
  list: (productId: string) =>
    request<{ milestones: MilestoneResult[]; product: Product }>(`/api/products/${productId}/milestones`),
};
