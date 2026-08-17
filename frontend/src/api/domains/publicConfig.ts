/**
 * Public, unauthenticated site config (currently just the contact email) shown before login.
 */

import { request } from '../httpClient';

export const publicConfig = () => request<{ contactEmail: string }>('/api/config');
