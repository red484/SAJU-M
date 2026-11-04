const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function check(path, verify) {
  const response = await fetch(base + path, { redirect: 'manual' });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.text();
  if (!verify(body)) throw new Error(`${path}: unexpected response`);
  console.log(`PASS ${path}`);
}

await check('/api/health', body => JSON.parse(body).ok === true);
await check('/', body => body.includes('삶의 온기'));
// A missing policy route can return the SPA with HTTP 200, so verify its heading too.
for (const [path, heading] of [
  ['/pricing/', '상품 및 이용 안내'],
  ['/terms/', '서비스 이용약관'],
  ['/refund/', '청약철회 및 환불정책'],
  ['/privacy/', '개인정보처리방침']
]) await check(path, body => body.includes(`<h1>${heading}</h1>`) && body.includes('792-88-03521') && body.includes('ashwoodfriends@ashwoodfriends.com'));
await check('/legal/legal.css', body => body.includes('.shell{'));
console.log(`Smoke test passed: ${base}`);
