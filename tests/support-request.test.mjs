import test from 'node:test';
import assert from 'node:assert/strict';
import { supportDraft } from '../legal/support-request.js';

test('minor cancellation draft includes unverified relationship and optional transaction information',()=>{
 const draft=supportDraft({kind:'minor',channel:'toss',role:'guardian',date:'2026-11-05',order:'order-123',product:'상담 이용권',note:'거래 확인을 요청합니다.'});
 assert.match(draft.body,/미성년자 구매 취소 문의/);assert.match(draft.body,/보호자 \(본인·보호자 확인 전\)/);
 assert.match(draft.body,/2026-11-05/);assert.match(draft.body,/order-123/);assert.match(draft.body,/상담 이용권/);
 assert.match(draft.body,/환불 승인·본인 확인·보호자 동의가 완료된 것은 아닙니다/);
 const uri=new URL(draft.mailto);assert.equal(uri.pathname,'ashwoodfriends@ashwoodfriends.com');
 assert.equal(uri.searchParams.get('body'),null,'user copies the draft; long private contents never go into a URL');
 assert.equal(uri.searchParams.get('subject'),draft.subject);assert.ok(!draft.mailto.includes('order-123'));
});

test('unknown input uses fixed labels, invalid dates stay unconfirmed and controls and lengths are bounded',()=>{
 const draft=supportDraft({kind:'__proto__',channel:'evil\r\nBcc: other',role:'constructor',date:'2026-02-30',order:'a\u0000\norder',note:'x'.repeat(1000)});
 assert.match(draft.body,/요청 유형: 환불 문의/);assert.match(draft.body,/구매 채널: 구매 채널 미확인/);assert.match(draft.body,/결제일: 미확인/);
 assert.match(draft.body,/주문번호: a order/);assert.ok(!draft.body.includes('\u0000'));assert.ok(!draft.body.includes('x'.repeat(801)));
 assert.ok(!draft.body.includes('요청자 관계:'));
 assert.match(supportDraft({kind:'minor',role:'__proto__'}).body,/기타·미확인/);
});

test('draft generation never calls network or storage and preserves free text as plain text',()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>assert.fail('no network');
 try {
  const draft=supportDraft({kind:'restore',channel:'web',note:'<img src=x onerror=alert(1)>'});
  assert.ok(draft.body.includes('<img src=x onerror=alert(1)>'));
  assert.ok(!draft.mailto.includes('<img'));
 }finally{globalThis.fetch=originalFetch;}
});
