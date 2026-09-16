# 프론트엔드 구조

## 한눈에 보기

| 항목 | 현재 구현 |
|---|---|
| 실행 환경 | 브라우저, Vite 빌드 |
| 운영 제공 | `saju-web` Nginx 컨테이너가 `dist/client` 제공 |
| 프레임워크 | 별도 UI 프레임워크 없는 모듈형 JavaScript |
| 사주 계산 | 브라우저의 순수 산술 엔진 |
| 서버 통신 | 동일 출처 상대 경로 `/api/*` |
| 사용자 식별 | HttpOnly 익명 쿠키, 선택적 Apple·Google 로그인 |
| 로컬 상태 | 화면 상태와 서버 저장 전 임시 입력 |

## 디렉터리 역할

| 경로 | 책임 |
|---|---|
| `src/client/app.js` | 화면 전환, 이벤트, 앱 상태 조정 |
| `src/client/design.js` | 결과·오늘·상담 등 화면 렌더링 |
| `src/client/engine.js` | 사주 원국·대운·흐름 계산 |
| `src/client/constants.js` | 계산 규칙과 해석 상수 |
| `src/client/time.js` | 시간대·지방평균태양시 보조 |
| `src/client/api/client.js` | timeout과 JSON 응답을 통일한 HTTP 래퍼 |
| `src/client/api/journal.js` | 선택 기록 동기화 API |
| `src/client/api/readings.js` | AI 상담·대운 판독 API |
| `src/client/api/auth.js` | 로그인 상태·로그아웃·회원 탈퇴 API |
| `src/client/journal-merge.js` | 서버 기록과 화면 기록 병합 |
| `src/client/capture.js` | 대화 캡처 이미지 생성 |
| `src/client/styles/*` | 레이아웃·디자인 시스템 |

## 프론트가 소유하는 것

- 생년월일시 입력, 만세력, 오행, 대운, 일진, 택일의 결정적 계산
- 페이지 렌더링과 사용 중인 화면 상태
- AI가 없어도 가능한 규칙 기반 해석과 코칭 폴백
- 저장 충돌 또는 네트워크 오류 시 입력을 화면에 유지하는 UX

## 프론트가 소유하지 않는 것

- Cafe24 API 키와 공급자 호출
- 영구 보관의 최종본과 revision 증가
- 익명 세션 식별자 생성·해시
- AI 사용량, 지연시간, 오류, 감사 로그
- 데이터베이스 연결 정보

로그인 전에도 전체 기능을 쓸 수 있다. 로그인하면 현재 익명 기록을 계정 기록과 ID 기준으로 합치며, 이후 다른 모바일 브라우저에서도 같은 계정으로 불러온다.

## API 사용

| 동작 | API | timeout | 실패 시 처리 |
|---|---|---:|---|
| 기록 읽기 | `GET /api/journal` | 15초 | 화면의 기존 상태 유지 |
| 기록 저장 | `PUT /api/journal` | 15초 | 오류 안내, 409면 새로고침 유도 |
| 기록 삭제 | `DELETE /api/journal` | 15초 | 삭제 실패 안내 |
| 상담 상태/요청 | `GET/POST /api/coach` | 15초/65초 | 규칙 기반 코칭 또는 오류 안내 |
| 대운 판독 상태/요청 | `GET/POST /api/epic` | 15초/65초 | 기존 계산 결과 유지 |

운영에서는 프론트와 API가 같은 도메인에 있으므로 별도 API URL이나 CORS 허용 목록을 프론트 번들에 넣지 않는다.

## 저장과 동기화

1. 첫 요청에서 백엔드가 `dalbit_session` 쿠키를 발급한다.
2. 프론트는 서버가 준 `revision`을 다음 `PUT`에 함께 보낸다.
3. 서버 revision과 다르면 `409 Conflict`를 받고 자동 덮어쓰지 않는다.
4. 데이터는 `records`와 `conversations` 배열을 포함한 JSON 객체여야 한다.
5. 한 요청의 최대 본문 크기는 1MB다.

## 변경 시 확인

- 계산 모듈에는 네트워크·난수·현재시각 의존성을 넣지 않는다.
- API 키나 DB URL이 `VITE_` 변수 또는 브라우저 번들에 들어가지 않았는지 확인한다.
- 360px 모바일, 키보드 열림, 긴 상담 답변, 서버 장애 상태를 확인한다.
- `npm test`와 `npm run build`를 통과시킨다.
