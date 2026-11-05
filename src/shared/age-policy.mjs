// Eligibility is based on the Korean calendar date, not the device clock.
export const AGE_NOTICE = '만 14세 이상만 이용할 수 있어요. 만 14세 미만은 가입·상담·기록 입력과 구매를 이용할 수 없습니다.';
export function ageEligibility(birth, today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())) {
  if (typeof birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return false;
  const date = new Date(birth+'T00:00:00Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,10) !== birth || birth < '1900-01-01' || birth > today) return false;
  const [y,m,d] = today.split('-').map(Number), [by,bm,bd] = birth.split('-').map(Number);
  return y-by-(m<bm || (m===bm && d<bd) ? 1 : 0) >= 14;
}
