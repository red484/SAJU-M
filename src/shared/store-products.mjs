// Same product ids in App Store Connect and Google Play. Android also needs the base plan below.
export const STORE_BASE_PLAN = 'monthly';
export const STORE_PLANS = Object.freeze({
  ongi_plus_monthly: Object.freeze({ id: 'ongi_plus_monthly', plan: 'plus', name: '온기 플러스', price: 4900, answers: 50, unlimited: false }),
  ongi_unlimited_monthly: Object.freeze({ id: 'ongi_unlimited_monthly', plan: 'unlimited', name: '온기 무제한', price: 49000, dailyLimit: 200, unlimited: true })
});
// Keep historical products recognizable for restoration, but offer only Plus for new purchases.
export const STORE_PLAN_LIST = Object.freeze([STORE_PLANS.ongi_plus_monthly]);
export const PLUS_ANSWERS = STORE_PLANS.ongi_plus_monthly.answers;
export const UNLIMITED_DAILY_LIMIT = STORE_PLANS.ongi_unlimited_monthly.dailyLimit;
