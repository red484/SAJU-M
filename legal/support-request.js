const kinds = { refund: '환불 문의', restore: '미지급·복원 문의', minor: '미성년자 구매 취소 문의', duplicate: '중복 결제 문의' };
const channels = { toss: '토스', web: '웹 결제 내역 확인 요청', unknown: '구매 채널 미확인' };
const roles = { buyer: '구매자 본인', guardian: '보호자', other: '기타·미확인' };
const clean = (value, max) => String(value || '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
export function supportDraft(values) {
  const kind = Object.hasOwn(kinds, values.kind) ? values.kind : 'refund';
  const channel = Object.hasOwn(channels, values.channel) ? values.channel : 'unknown';
  const stamp = Date.parse(values.date || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(values.date || '') && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === values.date ? values.date : '미확인';
  const subject = `[삶의 온기] ${kinds[kind]}`;
  const body = [`요청 유형: ${kinds[kind]}`, `구매 채널: ${channels[channel]}`,
    ...(kind === 'minor' ? [`요청자 관계: ${Object.hasOwn(roles, values.role) ? roles[values.role] : roles.other} (본인·보호자 확인 전)`] : []),
    `결제일: ${date}`, `상품명: ${clean(values.product, 100).replace(/\s+/g, ' ') || '미확인'}`, `주문번호: ${clean(values.order, 100).replace(/\s+/g, ' ') || '미확인'}`,
    '', '요청 사항:', clean(values.note, 800) || '거래 내역과 가능한 처리 방법을 확인해 주세요.',
    '', '※ 문의 문안이며 환불 승인·본인 확인·보호자 동의가 완료된 것은 아닙니다.'
  ].join('\n');
  return { subject, body, mailto: `mailto:ashwoodfriends@ashwoodfriends.com?subject=${encodeURIComponent(subject)}` };
}

export function mountSupportRequest(root = document) {
  const section = root.querySelector('[data-support-request]');
  if (!section || section.dataset.ready) return;
  section.dataset.ready = 'true';
  const form = section.querySelector('form'), result = section.querySelector('[data-support-result]');
  const preview = section.querySelector('[data-support-preview]'), status = section.querySelector('[data-support-status]');
  const refresh = () => {
    section.querySelector('[data-support-minor]').hidden = form.elements.kind.value !== 'minor';
    section.querySelector('[data-support-web]').hidden = form.elements.channel.value !== 'web';
    result.hidden = true; preview.value = ''; status.textContent = '';
  };
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const draft = supportDraft(Object.fromEntries(new FormData(form)));
    preview.value = draft.body;
    section.querySelector('[data-support-mail]').href = draft.mailto;
    result.hidden = false;
    status.textContent = '문안이 준비됐어요. 복사한 뒤 메일에 붙여 보내야 접수됩니다. 아직 전송되지 않았습니다.';
  });
  section.querySelector('[data-support-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(preview.value); status.textContent = '문안을 복사했어요. 이메일에 붙여 넣고 발송해 주세요. 아직 접수되지 않았습니다.'; }
    catch { preview.focus(); preview.select(); status.textContent = '자동 복사를 이용할 수 없어요. 선택된 문안을 직접 복사해 이메일로 보내주세요.'; }
  };
  section.querySelector('[data-support-clear]').onclick = () => { form.reset(); refresh(); };
  section.hidden = false;
  refresh();
}
if (typeof document !== 'undefined') mountSupportRequest(document);
