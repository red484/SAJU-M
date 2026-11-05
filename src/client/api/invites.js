import { apiRequest } from './client.js';

const BASE = '/api/relationship-invites';
const post = (path, summary) => apiRequest(path, { method: 'POST', body: JSON.stringify({ summary }) });
export const listInvites = () => apiRequest(BASE);
export const createInvite = summary => post(BASE, summary);
export const deleteInvite = id => apiRequest(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const openInvite = token => apiRequest(`${BASE}/public/${encodeURIComponent(token)}`);
export const acceptInvite = (token, summary) => post(`${BASE}/public/${encodeURIComponent(token)}`, summary);
