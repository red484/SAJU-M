// A relationship is read from nicknames and element counts only, never from birth data.
// Elements run 목·화·토·금·수: each feeds the next and restrains the one after that.
const ELEMENT_NAMES = ['목', '화', '토', '금', '수'];
const BEHAVIOR = ['새로 시작하고 넓혀 가는 쪽', '먼저 표현하고 분위기를 여는 쪽', '품고 버티며 자리를 지키는 쪽', '기준을 세우고 따져 보는 쪽', '경우의 수를 살피고 깊이 생각하는 쪽'];

export function validSummary(value) {
  return !!value && typeof value === 'object' && typeof value.name === 'string' && value.name.length <= 20
    && Number.isInteger(value.element) && value.element >= 0 && value.element < 5
    && Array.isArray(value.cnt) && value.cnt.length === 5 && value.cnt.every(n => Number.isInteger(n) && n >= 0 && n <= 8)
    && Object.keys(value).length === 3;
}
export const summaryOf = (result, name) => ({ name: String(name || '').slice(0, 20), element: result.element, cnt: [...result.cnt] });

const peaks = (cnt, pick) => { const edge = pick(...cnt); return cnt.flatMap((n, i) => n === edge ? [i] : []); };

const RELATION = {
  same: ['비슷한 속도로 움직이는 사이', '같은 방식으로 생각하는 편이라 설명 없이 통하는 부분이 많을 수 있어요. 둘 다 같은 것을 원할 때는 누가 양보할지가 흐려지기 쉬워요.', '정할 일이 생기면 누가 결정할지부터 먼저 말해 보세요.'],
  feeds: ['{a}님이 {b}님을 밀어주기 쉬운 사이', '{a}님은 챙기는 쪽, {b}님은 받는 쪽으로 굳어지기 쉬워요. {a}님이 지쳤다는 말을 늦게 꺼낼 수 있어요.', '{b}님이 먼저 "이번엔 내가 할게"라고 말할 일을 하나 정해 보세요.'],
  fed: ['{b}님이 {a}님을 밀어주기 쉬운 사이', '{b}님은 챙기는 쪽, {a}님은 받는 쪽으로 굳어지기 쉬워요. {b}님이 지쳤다는 말을 늦게 꺼낼 수 있어요.', '{a}님이 먼저 "이번엔 내가 할게"라고 말할 일을 하나 정해 보세요.'],
  checks: ['{a}님이 {b}님을 다잡기 쉬운 사이', '{a}님의 말이 {b}님에게는 지적처럼 들릴 수 있어요. 대신 {b}님이 놓친 점을 잘 잡아 줄 수 있어요.', '{a}님은 조언 전에 "지금 의견이 필요해?"라고 먼저 물어보세요.'],
  checked: ['{b}님이 {a}님을 다잡기 쉬운 사이', '{b}님의 말이 {a}님에게는 지적처럼 들릴 수 있어요. 대신 {a}님이 놓친 점을 잘 잡아 줄 수 있어요.', '{b}님은 조언 전에 "지금 의견이 필요해?"라고 먼저 물어보세요.']
};
function relationKey(a, b) {
  const gap = (b - a + 5) % 5;
  return ['same', 'feeds', 'checks', 'checked', 'fed'][gap];
}

export function compatibility(a, b) {
  const nameA = a.name || '나', nameB = b.name || '상대';
  const fill = text => text.replaceAll('{a}', nameA).replaceAll('{b}', nameB);
  const [title, friction, action] = RELATION[relationKey(a.element, b.element)].map(fill);
  const strongA = peaks(a.cnt, Math.max), weakA = peaks(a.cnt, Math.min), strongB = peaks(b.cnt, Math.max), weakB = peaks(b.cnt, Math.min);
  const fromB = strongB.find(i => weakA.includes(i)), fromA = strongA.find(i => weakB.includes(i));
  const lines = [];
  if (fromB !== undefined) lines.push(`${nameB}님은 ${nameA}님에게 적은 ${BEHAVIOR[fromB]}을 채워 줄 수 있어요.`);
  if (fromA !== undefined) lines.push(`${nameA}님은 ${nameB}님에게 적은 ${BEHAVIOR[fromA]}을 채워 줄 수 있어요.`);
  if (!lines.length) lines.push(`두 분은 ${BEHAVIOR[strongA[0]]}${strongA[0] === strongB[0] ? '이 함께 강해 같은 방식으로 부딪힐 수 있어요.' : `과 ${BEHAVIOR[strongB[0]]}으로 서로 다른 강점을 가졌어요.`}`);
  return { title, complement: lines.join(' '), friction, action, basis: `${nameA}님 ${ELEMENT_NAMES[a.element]} · ${nameB}님 ${ELEMENT_NAMES[b.element]} 기준의 해석이에요.` };
}
