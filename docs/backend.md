# 백엔드 구조

## 한눈에 보기

| 항목 | 현재 구현 |
|---|---|
| 런타임 | Node.js 22, ESM |
| 진입점 | `server/index.mjs` |
| 운영 포트 | 컨테이너 내부 `9090` |
| 운영 저장소 | PostgreSQL 필수 |
| 개발 저장소 | `.data` JSON 파일 fallback |
| 외부 AI | Cafe24 LLM Router, 다중 키 fallback |
| 인증 | Apple·Google OAuth, HttpOnly 서버 세션 |
| 결제 | 없음 |

## 모듈 구조

| 계층 | 경로 | 책임 |
|---|---|---|
| 부팅 | `server/index.mjs`, `server/db.mjs` | 환경 검사, DB pool, migration, HTTP 시작 |
| 라우팅 | `src/server/api-handler.mjs`, `routes/*` | method·origin·payload 검사, 응답 매핑 |
| 서비스 | `src/server/services/*` | 상담·대운 판독 업무 규칙과 안전 폴백 |
| 연동 | `src/server/integrations/cafe24-llm.mjs` | 키 회전, 재시도, 응답 정규화 |
| 저장소 | `src/server/repositories/*` | PostgreSQL/개발 파일/telemetry 접근 |
| 공통 | `http.mjs`, `session.mjs`, `rate-limit.mjs` | JSON, 쿠키, 익명 ID, 메모리 제한 |

라우트는 SQL이나 Cafe24 요청 형식을 직접 알지 않는다. 저장은 repository, AI 호출은 service/integration 계층을 통한다.

## API 계약

| Method | Path | 요청/용도 | 성공 응답 | 주요 오류 |
|---|---|---|---|---|
| GET | `/health`, `/api/health` | 프로세스와 AI 설정 확인 | `{ok, service, ai}` | — |
| GET | `/api/ready` | DB 질의 가능 여부 | `{ok:true, ready:true}` | `503` |
| GET | `/api/journal` | 현재 세션 기록 읽기 | `{data, revision}` 또는 저장소 기본값 | `503` |
| PUT | `/api/journal` | `{data, revision}` 저장 | `{ok, revision}` | `400`, `403`, `409`, `413`, `503` |
| DELETE | `/api/journal` | 기록과 세션 쿠키 삭제 | `{ok:true}` | `403`, `503` |
| GET | `/api/coach` | 상담 연결 여부 | `{available}` | — |
| POST | `/api/coach` | 계산 결과와 대화로 상담 | `{text, offer, source, shape}` | `403`, `429`, `502`, `503` |
| GET | `/api/epic` | 대운 판독 연결 여부 | `{available}` | — |
| POST | `/api/epic` | 계산된 대운 구간 판독 | `{reading, shape}` | `403`, `429`, `502`, `503` |
| GET | `/api/auth/providers` | 활성 로그인 제공자 | `{google, apple}` | — |
| GET | `/api/auth/start` | OAuth 로그인 시작 | 제공자 화면으로 이동 | `503` |
| GET/POST | `/api/auth/callback/:provider` | Google/Apple callback | 설정 화면으로 이동 | `400` |
| GET | `/api/auth/me` | 현재 로그인 계정 | `{user}` | — |
| POST | `/api/auth/logout` | 서버 세션 종료 | `{ok:true}` | `403` |
| DELETE | `/api/auth/account` | 계정·연결 데이터 삭제 | `{ok:true}` | `401`, `403` |

쓰기·AI POST는 동일 출처를 검사한다. AI 요청 본문은 100KB, journal 본문은 1MB로 제한한다.

## 요청 흐름

```text
Browser → external Nginx(HTTPS)
        ├─ /            → saju-web:80
        └─ /api, health → saju-backend:9090
                              ├─ PostgreSQL
                              └─ Cafe24 LLM Router
```

### 기록

`cookie → SHA-256 session id → repository.get/put/delete → PostgreSQL`. 쿠키 원문은 DB에 저장하지 않는다. `PUT`은 revision 비교와 갱신을 하나의 SQL 조건으로 처리해 조용한 덮어쓰기를 막는다.

### AI

안전 필터와 규칙 기반 답을 먼저 준비하고 Cafe24를 호출한다. 429·500·502·503·504면 다음 키로 넘어간다. 원문 프롬프트와 답변은 DB telemetry에 저장하지 않고, 상태·모델·키 라벨·토큰·지연시간만 기록한다.

현재 `llm_requests` 한 행은 HTTP API 호출의 최종 결과를 요약한다. 키별 시도 하나하나를 별도 행으로 기록하는 구조는 아직 아니다.

## 환경 변수

| 이름 | 필수 범위 | 설명 |
|---|---|---|
| `DATABASE_URL` | 운영 backend | 앱 전용 PostgreSQL URL |
| `POSTGRES_ADMIN_URL` | 최초 DB 준비 | DB/role 생성 권한 URL |
| `POSTGRES_URL` | 운영 compose | 앱용 URL, backend의 `DATABASE_URL`로 전달 |
| `DB_POOL_SIZE` | 선택 | 기본 10 |
| `CAFE24_LLM_API_KEY` | AI 사용 시 | 단일 기본 키 |
| `CAFE24_LLM_API_KEYS` | 선택 | 쉼표 구분 fallback 키 |
| `CAFE24_LLM_KEY_LABELS` | 선택 | 비밀값 대신 로그에 남길 라벨 |
| `CAFE24_LLM_MODEL` | 선택 | 기본 `cafe24/auto` |
| `CAFE24_LLM_BASE_URL` | 선택 | Router endpoint override |
| `AUTH_BASE_URL` | 운영 로그인 | 서비스의 HTTPS origin |
| `GOOGLE_CLIENT_ID/SECRET` | Google 로그인 | Google OAuth 웹 클라이언트 |
| `APPLE_CLIENT_ID` | Apple 로그인 | Services ID |
| `APPLE_TEAM_ID/KEY_ID/PRIVATE_KEY` | Apple 로그인 | client secret 서명 자격 |

## 보안과 한계

- 비밀값은 서버 `.env.production`에만 두고 저장소에 커밋하지 않는다.
- 세션 쿠키는 HttpOnly, SameSite=Lax이며 HTTPS에서는 Secure다.
- 상담은 세션당 1분 12회, 대운 판독은 10분 4회로 제한한다.
- 현재 rate limit은 프로세스 메모리다. 다중 backend replica에서는 Redis 같은 공유 제한기로 교체해야 한다.
- 로그인 전 기록은 쿠키가 사라지면 찾을 수 없다. 로그인 후에는 검증된 공급자 계정으로 복원한다.
