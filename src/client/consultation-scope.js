// Explicit unrelated requests are handled before either local or AI generation.
// Short follow-ups remain available; nuanced boundaries are also in the system prompt.
export function unrelatedQuestion(text) {
  // Weather mentioned as context for a relationship concern is not a forecast request.
  if (/날씨/.test(text) && /데이트|연애|고백|만남|관계|진로|이직/.test(text) && !/날씨.{0,12}(알려|예보|조회|어때|어떻)/.test(text)) return false;
  return /(?:날씨|기온|강수|미세먼지|일기예보|비\s*(?:와|오나요|올까))|(?:코드\s*(?:짜|작성)|프로그래밍|파이썬|자바스크립트|SQL\s*쿼리)|(?:레시피|요리법|맛집\s*추천|뉴스\s*알려|환율\s*알려)|(?:번역해|번역해줘|수학\s*문제|숙제\s*해)/i.test(text);
}
export const SCOPE_NOTICE = '달빛 도령은 사주 해석과 그에 연결된 연애·진로·관계·선택 고민을 함께 정리하는 상담이에요. 날씨 조회나 일반 정보 검색은 도와드리지 않아요. 지금 고민 중인 선택이나 궁금한 사주 흐름을 알려주세요.';
