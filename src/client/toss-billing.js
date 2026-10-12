import { apiRequest } from './api/client.js';
import { TOSS_PRODUCT } from '../shared/toss-product.mjs';

export function createTossPurchaseClient({ iap, request = apiRequest }) {
  async function grant(orderId) {
    const { response, body } = await request('/api/toss-billing/grant', { method: 'POST', body: JSON.stringify({ orderId }), timeout: 25_000 });
    if (!response.ok || !body.granted) throw new Error(body.error || '구매 내역을 확인하지 못했어요.');
    return true;
  }
  return {
    async product() {
      const { response, body } = await request('/api/toss-billing/product');
      if (!response.ok || !body.enabled) throw new Error('결제 연결을 준비하고 있어요.');
      const result = await iap.getProductItemList();
      const product = result?.products?.find(item => item.sku === TOSS_PRODUCT.sku);
      if (!product) throw new Error('현재 구매할 수 없는 상품이에요. 토스 앱 버전과 상품 공개 상태를 확인해 주세요.');
      return product;
    },
    async restore() {
      const pending = await iap.getPendingOrders();
      if (!pending) throw new Error('구매 복원을 지원하는 최신 토스 앱으로 업데이트해 주세요.');
      let count = 0;
      for (const order of pending.orders) {
        if (order.sku !== TOSS_PRODUCT.sku) continue;
        await grant(order.orderId);
        if (await iap.completeProductGrant({ params: { orderId: order.orderId } }) !== true)
          throw new Error('상담은 지급됐지만 구매 완료 확인이 지연됐어요. 구매 복원을 다시 눌러 주세요.');
        count++;
      }
      return count;
    },
    purchase() {
      return new Promise((resolve, reject) => {
        let cleanup, finished = false;
        const finish = (error) => {
          if (finished) return;
          finished = true;
          cleanup?.();
          globalThis.removeEventListener?.('pagehide', leave);
          error ? reject(error) : resolve();
        };
        const leave = () => finish(new Error('결제가 중단됐어요. 다음 실행 때 구매 내역을 복원합니다.'));
        globalThis.addEventListener?.('pagehide', leave, { once: true });
        try {
          cleanup = iap.createOneTimePurchaseOrder({
            options: { sku: TOSS_PRODUCT.sku, processProductGrant: async ({ orderId }) => {
              try { return await grant(orderId); } catch { return false; }
            } },
            onEvent: event => { if (event.type === 'success') finish(); },
            onError: error => finish(new Error(error?.errorCode === 'USER_CANCELED' ? '결제를 취소했어요.' : '결제가 완료되지 않았어요. 이미 결제했다면 구매 복원을 눌러 주세요.'))
          });
          if (finished) cleanup?.();
          else if (typeof cleanup !== 'function') finish(new Error('인앱 결제를 지원하는 토스 앱으로 업데이트해 주세요.'));
        } catch (error) { finish(error); }
      });
    }
  };
}

let clientPromise, busy = false;
const restoredAccounts = new Set();
const getClient = () => clientPromise ||= import('@apps-in-toss/web-framework').then(({ IAP }) => createTossPurchaseClient({ iap: IAP }));

export function installTossBilling({ page, user, openModal, notice, onChanged }) {
  async function restore(silent = false) {
    if (busy || !user) return;
    busy = true;
    try {
      const count = await (await getClient()).restore();
      if (count) { await onChanged(); notice('구매한 상담 이용권을 복원했어요.'); }
      else if (!silent) notice('복원할 미지급 주문이 없어요. 기존 이용권은 계정에 보관되어 있어요.');
    } catch (error) { if (!silent) notice(error.message); }
    finally { busy = false; }
  }
  if (user?.id && !restoredAccounts.has(user.id)) { restoredAccounts.add(user.id); void restore(true); }
  async function overview() {
    openModal(`<section class="subscription-sheet purchase-sheet"><p class="eyebrow">자동 갱신 없는 1회 결제</p><h2>결제하시겠습니까?</h2><article class="purchase-plan"><h3>달빛 플러스 상담 50회</h3><div class="purchase-allowance"><b>AI 상담 50회</b><span>구매 후 30일 · 자동결제 없음</span></div><p class="purchase-amount">4,895<span>원 · 부가세 포함</span></p><ul><li>정상 AI 답변에만 횟수 차감</li><li>무료 상담 소진 후 이용권 사용</li><li>구매 후 30일 또는 50회 소진 시 종료</li><li>동일 토스 계정에 이용권 저장</li></ul><p>환불은 토스 앱의 인앱결제 구매내역에서 신청할 수 있어요. 환불 완료 시 남은 이용권은 사용할 수 없습니다.</p><p id="toss-purchase-status" role="status">상품을 확인하고 있어요.</p><button class="primary" id="toss-purchase" disabled>4,895원 결제하기</button><button class="secondary" id="toss-restore">구매 복원</button><button class="secondary" id="toss-close">나중에 할게요</button></article></section>`);
    const pay = document.getElementById('toss-purchase'), status = document.getElementById('toss-purchase-status');
    document.getElementById('toss-close').onclick = () => { if (!busy) document.querySelector('#modal').close(); };
    document.getElementById('toss-restore').onclick = () => restore();
    if (!user) { status.textContent = '토스 로그인 후 구매해 주세요.'; return; }
    try {
      const client = await getClient(), product = await client.product();
      if (!pay.isConnected) return;
      status.textContent = '최종 결제 금액은 토스 결제창에서 확인해 주세요.';
      pay.textContent = `${product.displayAmount} 결제하기`; pay.disabled = false;
      pay.onclick = async () => {
        if (busy) return;
        busy = true; pay.disabled = true;
        try { await client.purchase(); await onChanged(); document.querySelector('#modal').close(); notice('상담 50회가 지급됐어요. 구매 후 30일 동안 이용할 수 있어요.'); }
        catch (error) { status.textContent = error.message; }
        finally { busy = false; pay.disabled = false; }
      };
    } catch (error) { status.textContent = error.message; }
  }
  const quota = document.querySelector('.coach-quota');
  if (quota) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'subscription-inline';
    button.textContent = '상담 이용권 구매'; button.onclick = overview; quota.append(button);
  }
  if (page === 'settings') {
    const card = document.createElement('section'); card.className = 'card subscription-card';
    card.innerHTML = '<h2>달빛 플러스</h2><p>상담 50회 · 구매 후 30일 · 4,895원</p><button class="secondary">이용권 구매 및 복원</button>';
    card.querySelector('button').onclick = overview; document.querySelector('main')?.append(card);
  }
}
