export function createMemoryRateLimiter({ windowMs, max, maxKeys = 5000 }) {
  const buckets = new Map();
  return function allowed(key) {
    const now = Date.now();
    const hits = (buckets.get(key) || []).filter(time => now - time < windowMs);
    if (hits.length >= max) {
      buckets.set(key, hits);
      return false;
    }
    hits.push(now);
    buckets.set(key, hits);
    if (buckets.size > maxKeys) {
      for (const [bucketKey, values] of buckets) {
        if (!values.some(time => now - time < windowMs)) buckets.delete(bucketKey);
      }
    }
    return true;
  };
}
