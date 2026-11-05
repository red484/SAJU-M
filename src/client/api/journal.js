import {noteJournal} from '../../shared/note-journal.mjs';
import { apiRequest } from './client.js';

export const getJournal = (noteMode = false) => apiRequest(noteMode?'/api/journal?view=note':'/api/journal');
export const putJournal = (data, revision, noteMode = false) => apiRequest(noteMode?'/api/journal?view=note':'/api/journal', {
  method: 'PUT', body: JSON.stringify({ data:noteMode?noteJournal(data):data, revision })
});
export const deleteJournal = (anonymousOnly = false) => apiRequest('/api/journal', { method: 'DELETE', ...(anonymousOnly ? {body:JSON.stringify({anonymousOnly:true})} : {}) });
