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


test('follow-up prefers the consultation, then the earliest review without mutating records', async () => {
  const { findPurchaseFollowUp } = await import('../src/client/purchase-follow-up.js');
  const records = [
    {id:'new', date:'2026-11-04', result:'good'},
    {id:'later', due:'2026-11-10', result:'pending'},
    {id:'first', due:'2026-11-01', result:'pending'},
    {id:'linked', conversationId:'chat', result:'good'}
  ];
  const snapshot = structuredClone(records);
  assert.equal(findPurchaseFollowUp(records, {id:'chat',attachedRecordId:'later'}).id, 'later');
  assert.equal(findPurchaseFollowUp(records, {id:'chat'}).id, 'linked');
  assert.equal(findPurchaseFollowUp(records, null).id, 'first');
  assert.equal(findPurchaseFollowUp(records.slice(0,1), null).id, 'new');
  assert.equal(findPurchaseFollowUp([], null), null);
  assert.deepEqual(records, snapshot);
});

test('web and Toss purchase sheets open examples, return to the offer and open saved records', async () => {
  const { installTossBilling } = await import('../src/client/toss-billing.js');
  const original = globalThis.document;
  try {
    for (const install of [installSubscription, installTossBilling]) {
      let html='', elements={}, entryButton={}, back, opened=0;
      globalThis.document = {
        createElement: () => ({querySelector: () => entryButton}),
        querySelector: selector => selector==='main'?{append() {}}:null,
        getElementById: id => elements[id] ??= {}
      };
      install({page:'settings',user:null,
        openModal: value => {html=value;elements={};},
        showExample: callback => {back=callback;html='상담 예시';},
        followUp: {label:'회고 · <나의 선택>',open:()=>opened++}
      });
      await entryButton.onclick();
      assert.equal(elements['purchase-example'].hidden, false);
      assert.equal(elements['purchase-follow-up'].textContent, '회고 · <나의 선택>');
      elements['purchase-example'].onclick();
      assert.equal(html, '상담 예시');
      await back();
      assert.match(html, /purchase-example/);
      assert.equal(elements['purchase-record-hint'].hidden, false);
      elements['purchase-follow-up'].onclick();
      assert.equal(opened, 1);
    }
  } finally {globalThis.document=original;}
});
