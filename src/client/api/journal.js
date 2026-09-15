import { apiRequest } from './client.js';

export const getJournal = () => apiRequest('/api/journal');
export const putJournal = (data, revision) => apiRequest('/api/journal', {
  method: 'PUT', body: JSON.stringify({ data, revision })
});
export const deleteJournal = () => apiRequest('/api/journal', { method: 'DELETE' });
