import { apiBase, appsInToss } from './api/client.js';
import { PRODUCT_EVENTS, PRODUCT_CHANNELS } from '../shared/product-events.mjs';
const key = 'ongi-product-metrics';
let channel = appsInToss ? 'toss' : 'web';
export function configureProductMetrics(value) { if (!appsInToss && PRODUCT_CHANNELS.includes(value)) channel = value; }
export function metricsEnabled() { try { return localStorage.getItem(key) === 'yes'; } catch { return false; } }
export function setMetricsEnabled(enabled) { try { if (enabled) localStorage.setItem(key, 'yes'); else localStorage.removeItem(key); } catch {} return metricsEnabled(); }
export function trackProductEvent(event) {
  if (!metricsEnabled() || !PRODUCT_EVENTS.includes(event)) return;
  // Deliberately bypass apiRequest: never attach authentication or journal session headers.
  try { return fetch(`${apiBase}/api/product-events`, {
    method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, channel, consent: true })
  }).catch(() => {}); } catch {}
}
