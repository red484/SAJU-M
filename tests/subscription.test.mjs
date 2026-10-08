import test from 'node:test';
import assert from 'node:assert/strict';
import { PLUS_PLAN, subscriptionEnabled, installSubscription } from '../src/client/subscription.js';

test('approved preview price and allowance', () => {
  assert.deepEqual(PLUS_PLAN, { price: 4900, answers: 50 });
  assert.ok(Object.isFrozen(PLUS_PLAN));
});
test('subscription preview is web only', () => {
  assert.equal(subscriptionEnabled(), true);
  for (const platform of [{ native: true }, { toss: true }]) {
    assert.equal(subscriptionEnabled(platform), false);
    // No DOM or network access is needed on excluded platforms.
    assert.doesNotThrow(() => installSubscription(platform));
  }
});

test('guest must acknowledge ID before reaching non-chargeable preview', () => {
  const original = globalThis.document;
  let html = '', entry;
  let elements = {};
  const button = {};
  globalThis.document = {
    createElement: () => ({ querySelector: () => button }),
    querySelector: selector => selector === 'main' ? { append: card => { entry = card; } } : null,
    getElementById: id => elements[id] ??= {}
  };
  try {
    installSubscription({ page: 'settings', user: { loginId: 'guest-test' }, openModal: value => { html = value; elements = {}; }, notice: () => {} });
    assert.ok(entry);
    button.onclick();
    assert.match(html, /구독이 시작되거나 상담 횟수가 늘어나지/);
    elements['subscription-preview'].onclick();
    assert.equal(elements['subscription-guest-id'].value, 'guest-test');
    elements['subscription-next'].onclick();
    assert.match(html, /게스트 아이디를 보관/);
    elements['subscription-saved'].checked = true;
    elements['subscription-next'].onclick();
    assert.match(html, /0원 · 현재 결제 불가/);
    assert.match(html, /disabled>결제 준비 중/);
    assert.match(html, /없음 · 구독이 시작되지 않습니다/);
  } finally { globalThis.document = original; }
});
