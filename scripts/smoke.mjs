const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function check(path, verify) {
  const response = await fetch(base + path, { redirect: 'manual' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.text();
  if (!verify(body)) throw new Error(`${path}: unexpected response`);
  console.log(`PASS ${path}`);
}

await check('/api/health', body => JSON.parse(body).ok === true);
await check('/', body => body.includes('달빛 사주'));
console.log(`Smoke test passed: ${base}`);
