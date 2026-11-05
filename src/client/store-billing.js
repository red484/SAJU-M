import { Capacitor } from '@capacitor/core';
import { trackProductEvent } from './product-metrics.js';
import { businessInfo } from './business-info.js';
import { apiRequest } from './api/client.js';
import { STORE_BASE_PLAN, STORE_PLAN_LIST } from '../shared/store-products.mjs';

const IDS = STORE_PLAN_LIST.map(plan => plan.id);
// The app shell loads this page from the server, so an older binary can run it without the plugin.
export const storeBillingAvailable = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('NativePurchases');

export function createStorePurchaseClient({ purchases, productType, platform, request = apiRequest }) {
  async function sync(transaction) {
    const payload = platform === 'ios'
      ? { platform: 'apple', jws: transaction.jwsRepresentation }
      : { platform: 'google', purchaseToken: transaction.purchaseToken, productId: transaction.productIdentifier };
    const { response, body } = await request('/api/store-billing/sync', { method: 'POST', body: JSON.stringify(payload), timeout: 25_000 });
    if (!response.ok) throw new Error(body.error || '구독을 확인하지 못했어요.');
    return body;
  }
  // The store only hears "done" after our server has recorded the subscription.
  async function settle(transaction) {
    const granted = await sync(transaction);
    if (platform === 'ios') {
      if (transaction.needsFinish !== false) await purchases.finishTransaction({ transactionId: transaction.transactionId });
    } else if (!transaction.isAcknowledged) await purchases.acknowledgePurchase({ purchaseToken: transaction.purchaseToken });
    return granted;
  }
  return {
    async products() {
      const { response, body } = await request('/api/store-billing/plans');
      if (!response.ok || !body.enabled) throw new Error('구독 판매를 준비하고 있어요.');
      const { products } = await purchases.getProducts({ productIdentifiers: IDS, productType });
      return new Map(products.map(product => [product.identifier, product]));
    },
    async purchase(productId, userId) {
      const transaction = await purchases.purchaseProduct({ productIdentifier: productId, productType, planIdentifier: STORE_BASE_PLAN, appAccountToken: userId, quantity: 1, autoAcknowledgePurchases: false });
      return settle(transaction);
    },
    async restore({ askStore = false } = {}) {
      if (askStore) await purchases.restorePurchases();
      const { purchases: owned } = await purchases.getPurchases({ productType });
      let count = 0;
      for (const transaction of owned) {
        if (!IDS.includes(transaction.productIdentifier)) continue;
        await settle(transaction);
        count++;
      }
      return count;
    },
    manage: () => purchases.manageSubscriptions()
  };
}

let clientPromise, busy = false;
const restoredAccounts = new Set();
const getClient = () => clientPromise ||= import('@capgo/native-purchases')
  .then(async ({ NativePurchases, PURCHASE_TYPE }) => {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios') await NativePurchases.configure({ autoFinishTransactions: false });
    return createStorePurchaseClient({ purchases: NativePurchases, productType: PURCHASE_TYPE.SUBS, platform });
  })
  .catch(error => { clientPromise = null; throw error; });

const friendly = error => /cancel/i.test(`${error?.code || ''} ${error?.message || ''}`) ? '결제를 취소했어요.' : (error?.message || '결제를 완료하지 못했어요. 이미 결제했다면 구매 복원을 눌러 주세요.');
const planLine = plan => plan.unlimited ? `AI 대화 무제한 · 공정 사용 기준 하루 ${plan.dailyLimit}회` : `AI 대화 매월 ${plan.answers}회`;
const storeName = () => Capacitor.getPlatform() === 'ios' ? 'App Store' : 'Google Play';

export function installStoreBilling({ page, user, openModal, notice, onChanged, resume, quota: allowance, showExample, followUp, navigate }) {
  if (!storeBillingAvailable()) return;
  async function restore(silent = false) {
    if (busy || !user) return;
    busy = true;
    try {
      const count = await (await getClient()).restore({ askStore: !silent });
      if (count) { trackProductEvent('purchase_restored'); await onChanged(); if (!silent) notice('구독을 복원했어요.'); }
      else if (!silent) notice('복원할 구독이 없어요.');
    } catch (error) { if (!silent) notice(friendly(error)); }
    finally { busy = false; }
  }
  // Once per account per launch: this runs on every render, and a failure must not repeat.
  if (user?.id && !restoredAccounts.has(user.id)) { restoredAccounts.add(user.id); void restore(true); }

  async function overview() {
    trackProductEvent('purchase_view');
    openModal(`<section class="subscription-sheet purchase-sheet"><p class="eyebrow">매월 자동 갱신 구독</p><h2>더 오래 함께 정리하기</h2>
      ${STORE_PLAN_LIST.map(plan => `<article class="purchase-plan" data-plan="${plan.id}"><div class="purchase-plan-heading"><h3>${plan.name}</h3><span>월 구독</span></div>
        <div class="purchase-allowance"><b>${planLine(plan)}</b><span>정상 AI 답변에만 차감</span></div>
        <p class="purchase-amount" data-price>가격 확인 중</p><button class="primary" data-buy disabled>구독하기</button></article>`).join('')}
      <p class="hint">결제는 ${storeName()} 계정으로 청구되며, 현재 기간이 끝나기 24시간 전까지 해지하지 않으면 같은 금액으로 매월 자동 갱신됩니다. 해지는 ${storeName()} 구독 설정에서 할 수 있고, 해지해도 결제한 기간이 끝날 때까지 이용할 수 있어요. 월 50회 상품의 남은 횟수는 다음 달로 넘어가지 않아요. 무제한 상품은 자동화된 남용을 막기 위해 하루 200회까지 이용할 수 있어요.</p>
      <p class="hint"><a href="/terms/">이용약관</a> · <a href="/privacy/">개인정보처리방침</a> · <a href="/refund/">환불정책</a> · <a href="/support/">고객지원</a></p>
      <button class="secondary" id="purchase-example" hidden>상담 예시 보기</button><p class="hint" id="purchase-record-hint" hidden>기록 열기와 회고는 무료예요.</p><button class="secondary" id="purchase-follow-up" hidden></button>
      <p id="store-purchase-status" role="status">상품을 확인하고 있어요.</p>
      <button class="secondary" id="store-restore">구매 복원</button><button class="secondary" id="store-manage">구독 관리</button><button class="secondary" id="store-close">나중에 할게요</button>${businessInfo}</section>`);
    if (showExample) { const example = document.getElementById('purchase-example'); example.hidden = false; example.onclick = () => showExample(overview); }
    if (followUp) { const record = document.getElementById('purchase-follow-up'); record.hidden = false; record.textContent = followUp.label; record.onclick = followUp.open; document.getElementById('purchase-record-hint').hidden = false; }
    const status = document.getElementById('store-purchase-status');
    document.getElementById('store-close').onclick = () => { if (!busy) document.querySelector('#modal').close(); };
    document.getElementById('store-restore').onclick = () => restore();
    document.getElementById('store-manage').onclick = async () => { try { await (await getClient()).manage(); } catch { notice(`${storeName()} 구독 설정에서 관리해 주세요.`); } };
    if (!user) { status.textContent = '로그인 후 구독할 수 있어요.'; const login = document.createElement('button'); login.className = 'primary'; login.textContent = '로그인하기'; login.onclick = () => { document.querySelector('#modal').close(); navigate?.('welcome'); }; status.after(login); return; }
    try {
      const client = await getClient(), products = await client.products();
      if (!status.isConnected) return;
      // Google bills a second plan on top of the first; it has to be cancelled before switching.
      const blocked = Capacitor.getPlatform() === 'android' && !!allowance?.plan;
      status.textContent = blocked ? '다른 상품으로 바꾸려면 구독 관리에서 현재 구독을 해지해 주세요.' : '최종 결제 금액은 결제창에서 확인해 주세요.';
      for (const article of document.querySelectorAll('[data-plan]')) {
        const id = article.dataset.plan, product = products.get(id), pay = article.querySelector('[data-buy]'), price = article.querySelector('[data-price]');
        const plan = STORE_PLAN_LIST.find(item => item.id === id);
        if (!product) { price.textContent = '구매할 수 없음'; continue; }
        price.textContent = `${product.priceString} / 월`;
        const current = allowance?.plan === plan.plan;
        pay.textContent = current ? '구독 중' : '구독하기';
        pay.disabled = current || blocked;
        pay.onclick = async () => {
          if (busy) return;
          busy = true; pay.disabled = true;
          try {
            trackProductEvent('purchase_start');
            await client.purchase(id, user.id);
            trackProductEvent('purchase_granted');
            await onChanged();
            openModal(`<h2>${plan.name}을 시작했어요</h2><p>${planLine(plan)}</p><button class="primary" id="store-resume">대화 이어가기</button>`);
            document.getElementById('store-resume').onclick = () => { document.querySelector('#modal').close(); resume?.(); };
          } catch (error) { status.textContent = friendly(error); pay.disabled = false; }
          finally { busy = false; }
        };
      }
    } catch (error) {
      trackProductEvent('purchase_product_error');
      status.textContent = error?.message || '상품을 불러오지 못했어요.';
    }
  }
  const quota = document.querySelector('.coach-quota');
  if (quota) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'subscription-inline';
    button.textContent = allowance?.plan ? '구독 관리' : '구독 안내'; button.onclick = overview; quota.append(button);
  }
  if (page === 'settings') {
    document.querySelector('.subscription-card')?.remove();
    const card = document.createElement('section'); card.className = 'card subscription-card';
    const current = STORE_PLAN_LIST.find(plan => plan.plan === allowance?.plan);
    card.innerHTML = `<h2>구독</h2><p>${current ? `${current.name} 이용 중` : '월 4,900원 50회 · 월 49,000원 무제한'}</p><button type="button" class="secondary">구독 안내 및 복원</button>`;
    card.querySelector('button').onclick = overview; document.querySelector('main')?.append(card);
  }
}
