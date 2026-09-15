export async function apiRequest(path, options = {}) {
  const { timeout = 15_000, ...requestOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      ...requestOptions,
      headers: requestOptions.body ? { 'Content-Type': 'application/json', ...requestOptions.headers } : requestOptions.headers,
      signal: requestOptions.signal || controller.signal
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}
