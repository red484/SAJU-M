// Fixed categories only; no account, conversation, order or free-text fields.
export const PRODUCT_EVENTS = Object.freeze(['purchase_view', 'purchase_product_error', 'purchase_start', 'purchase_granted', 'purchase_restored', 'consultation_first_answer', 'choice_saved', 'review_saved']);
export const PRODUCT_CHANNELS = Object.freeze(['web', 'android', 'ios', 'toss']);
export function validProductEvent(value) {
  return value && Object.keys(value).sort().join(',') === 'channel,consent,event' && value.consent === true && PRODUCT_EVENTS.includes(value.event) && PRODUCT_CHANNELS.includes(value.channel);
}
