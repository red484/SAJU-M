import { apiRequest } from './client.js';

export const authProviders = () => apiRequest('/api/auth/providers');
export const currentUser = () => apiRequest('/api/auth/me');
export const logout = () => apiRequest('/api/auth/logout', { method: 'POST' });
export const deleteAccount = () => apiRequest('/api/auth/account', { method: 'DELETE' });
export const loginUrl = provider => `/api/auth/start?provider=${encodeURIComponent(provider)}&returnTo=${encodeURIComponent('/settings')}`;
