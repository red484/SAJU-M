// Explicit unrelated requests are handled before either local or AI generation.
// Short follow-ups remain available; nuanced boundaries are also in the system prompt.
// Greetings, sighs and laughter get a kind reply here, without a model call or a charge.
export function smallTalkReply(text, note = false) {
  const input = String(text || '').trim();
  if (/^(?:안녕|안녕하세요|안녕하십니까|반가워요|하이|ㅎㅇ|hello|hi)[\s.!?~]*$/i.test(input))
    return note ? '안녕하세요. 오늘은 어떤 이야기부터 정리해 볼까요?' : '안녕하세요. 만나서 반가워요. 요즘 마음에 걸리는 일이 있다면 편하게 들려주세요.';
  if (/^[ㅠㅜ\s.…!?~]*[ㅠㅜ][ㅠㅜ\s.…!?~]*$/.test(input)) return '많이 힘드신가 봐요. 어떤 일이 있었는지 편한 만큼만 들려주세요.';
  if (!input || /^[\s\p{P}\p{S}\dㄱ-ㅎㅏ-ㅣ]+$/u.test(input) || /^(?:냠|얌|쩝|옴뇸|뇸|테스트|test|asdf)+[\s.!?~]*$/i.test(input))
    return '네, 듣고 있어요. 이어서 편하게 들려주세요.';
  return null;
}
export function unrelatedQuestion(text) {
  // Weather mentioned as context for a relationship concern is not a forecast request.
  if (/날씨/.test(text) && /데이트|연애|고백|만남|관계|진로|이직/.test(text) && !/날씨.{0,12}(알려|예보|조회|어때|어떻)/.test(text)) return false;
  return /(?:날씨|기온|강수|미세먼지|일기예보|비\s*(?:와|오나요|올까))|(?:코드\s*(?:짜|작성)|프로그래밍|파이썬|자바스크립트|SQL\s*쿼리)|(?:레시피|요리법|맛집\s*추천|뉴스\s*알려|환율\s*알려)|(?:번역해|번역해줘|수학\s*문제|숙제\s*해)/i.test(text);
}
export const NOTE_SCOPE_NOTICE = '이 대화는 선택과 기록, 고민을 함께 정리하는 공간이에요. 날씨 조회나 일반 정보 검색은 도와드리기 어려워요.';
export const SCOPE_NOTICE = '온기는 명리학 해석과 그에 연결된 연애·진로·관계·선택 고민을 함께 정리하는 상담이에요. 날씨 조회나 일반 정보 검색은 도와드리지 않아요. 지금 고민 중인 선택이나 살펴보고 싶은 고민을 알려주세요.';
