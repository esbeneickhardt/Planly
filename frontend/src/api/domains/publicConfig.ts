import { request } from '../httpClient';

export const publicConfig = () => request<{ contactEmail: string }>('/api/config');
