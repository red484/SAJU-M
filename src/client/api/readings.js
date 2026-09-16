import { apiRequest } from './client.js';

export const coachStatus = () => apiRequest('/api/coach');
export const requestCoach = (payload) => apiRequest('/api/coach', {
  method: 'POST', body: JSON.stringify(payload), timeout: 25_000
});
export const epicStatus = () => apiRequest('/api/epic');
export const requestEpic = (payload) => apiRequest('/api/epic', {
  method: 'POST', body: JSON.stringify(payload), timeout: 65_000
});
