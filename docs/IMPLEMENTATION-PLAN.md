# 달빛 사주 실서비스 구현 계획

`ARCHITECTURE.md`가 현재 상태를 설명한다면, 이 문서는 실제 사용자를 받기 위한 목표 구조와 구현 순서를 정의합니다.

## 먼저 고쳐야 할 문제

| 우선순위 | 현재 문제 | 사용자에게 생기는 문제 | 목표 |
|---|---|---|---|
| P0 | Render 무료 로컬 파일 저장 | 재배포·재시작 후 기록 소실 | PostgreSQL 영속 저장 및 백업 |
| P0 | 설정 화면은 “DB 저장”으로 안내 | 실제 동작과 안내가 달라 신뢰 하락 | 저장 방식과 복구 한계를 정확히 표시 |
| P0 | 익명 쿠키만으로 보관함 식별 | 쿠키 삭제·기기 교체 시 복구 불가 | 초기에는 복구 코드, 이후 선택적 계정 연결 |
| P0 | Node와 Worker의 API 기능이 다름 | 배포 대상에 따라 AI 기능 누락 | Render Node를 단일 운영 대상으로 확정 |
| P1 | `app.js`에 화면·상태·API·이벤트 결합 | 작은 수정도 전체 회귀 위험 | 기능별 프론트 모듈 분리 |
| P1 | `render-server.mjs`에 라우팅·세션·파일 저장 결합 | DB 교체와 테스트가 어려움 | route/service/repository 계층 분리 |
| P1 | 입력 스키마 검증이 수동·부분적 | 깨진 데이터와 과대 요청 유입 | 공통 스키마 검증 및 오류 규격 |
| P1 | AI 제한이 프로세스 메모리 | 재시작·서버 확장 시 제한 초기화 | DB 또는 공유 rate-limit 저장소 |
| P1 | 운영 관측이 콘솔 로그 중심 | 장애 원인과 실패율 추적 어려움 | request ID, 구조화 로그, 오류 모니터링 |
| P2 | 비활성 선택·기록 코드가 화면에 남음 | 번들·상태 구조가 복잡하고 안내가 혼재 | 출시 범위 확정 후 완성하거나 제거 |

## 목표 아키텍처

```text
가비아 DNS
  └─ app.example.com
      └─ Render Web Service
          ├─ 정적 프론트 dist/client
          └─ Node API /api/v1
              ├─ auth/session
              ├─ journal
              ├─ readings
              └─ health
                   ├─ PostgreSQL
                   └─ Cafe24 LLM Router
```

프론트와 API는 당분간 한 서비스·한 도메인으로 둡니다. 트래픽이나 조직 규모 때문에 독립 배포가 필요해질 때만 분리합니다. 지금 별도 API 도메인을 만들면 CORS, 쿠키, 인증, 배포 지점만 늘고 사용자 가치는 생기지 않습니다.

## 프론트엔드

### 책임

- 입력 폼, 결과, 오늘, 상담 UI
- 클라이언트 만세력 계산과 결과 표현
- API 호출 상태, 오프라인/재시도, 저장 충돌 복구 UI
- 접근성, 모바일 레이아웃, 사용자 문구

### 목표 디렉터리

```text
src/client/
  app.js                 # 앱 시작과 라우팅만
  api/
    client.js            # fetch, timeout, 오류 규격
    journal.js
    readings.js
  state/
    store.js
    journal-sync.js      # revision, merge, retry
  pages/
    birth.js
    result.js
    today.js
    chat.js
    settings.js
  components/
    navigation.js
    modal.js
    save-status.js
  domain/
    engine.js
    constants.js
    time.js
  styles/
    tokens.css
    base.css
    components.css
    pages.css
```

### 구현 항목

1. `/api/*` 호출을 API 클라이언트로 모으고 timeout·재시도·오류 메시지를 통일합니다.
2. 저장 상태를 `loading / saved / offline / conflict / failed`로 명시해 화면과 저장 로직을 분리합니다.
3. HTML 문자열 렌더링 경계를 줄이고 AI·사용자 텍스트는 반드시 escape된 경로로 출력합니다.
4. `app.js`의 페이지 템플릿과 이벤트 바인딩을 페이지별 모듈로 이동합니다.
5. 설정 화면의 “서버 데이터베이스” 문구는 DB 전환 전까지 실제 파일 저장과 복구 한계로 교정합니다.
6. 현재 비활성인 선택·기록 메뉴는 출시에서 숨긴 채 코드를 별도 기능으로 격리합니다.

## 백엔드

### 책임

- 세션 또는 계정 인증
- 입력 검증, 권한 검사, 요청 제한
- 기록의 원자적 저장과 revision 충돌 처리
- Cafe24 LLM 호출, 안전 폴백, 사용량과 오류 관측
- 정적 프론트 제공 및 health/readiness 제공

### 목표 디렉터리

```text
src/server/
  index.mjs
  app.mjs
  config.mjs
  routes/
    health.mjs
    journal.mjs
    coach.mjs
    epic.mjs
  middleware/
    session.mjs
    origin.mjs
    rate-limit.mjs
    errors.mjs
  services/
    journal-service.mjs
    coach-service.mjs
    epic-service.mjs
  repositories/
    journal-repository.mjs
    postgres-journal-repository.mjs
  integrations/
    cafe24-client.mjs
  schemas/
    journal.mjs
    reading.mjs
```

### API 규격

- 버전이 필요한 데이터 API는 `/api/v1`로 옮기고, 기존 `/api/*`는 한동안 호환 라우트로 유지합니다.
- 성공 응답: `{ data, meta? }`
- 오류 응답: `{ error: { code, message, retryable, requestId } }`
- 모든 POST/PUT에 body 크기, content type, 스키마 검증을 적용합니다.
- `/api/health`는 프로세스 생존만, `/api/ready`는 DB 연결까지 확인하도록 분리합니다.
- LLM 응답 전문과 생년월일을 일반 로그에 남기지 않습니다.

## 데이터베이스

### 1차 전환: 계정 없는 영속 저장

현재 프론트의 데이터 구조와 충돌 병합을 유지하면서 PostgreSQL로 옮기는 최소 스키마입니다.

```sql
create table anonymous_sessions (
  id uuid primary key,
  token_hash text unique not null,
  recovery_code_hash text unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz
);

create table journal_documents (
  session_id uuid primary key references anonymous_sessions(id) on delete cascade,
  payload jsonb not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

create table ai_request_events (
  id bigint generated always as identity primary key,
  session_id uuid references anonymous_sessions(id) on delete set null,
  feature text not null,
  model text,
  status text not null,
  latency_ms integer,
  created_at timestamptz not null default now()
);
```

전체 기록을 먼저 JSONB 문서 하나로 저장하는 이유는 현재 revision/merge 방식을 보존해 안전하게 전환하기 위해서입니다. 처음부터 프로필·대화·메시지를 모두 정규화하면 마이그레이션 범위와 장애 지점이 불필요하게 커집니다.

### 2차 전환: 선택적 계정

기기 간 동기화가 실제 요구될 때 `users`, `identities`, `user_sessions`를 추가하고 익명 보관함을 계정에 귀속합니다. 이메일·소셜 로그인을 도입하기 전까지는 복구 코드를 한 번 보여주고 해시만 서버에 저장합니다.

### 운영 원칙

- 자동 백업과 복구 훈련을 설정합니다.
- DB 연결은 최소 권한 계정을 사용합니다.
- 생년월일·상담 내용 보유 기간과 전체 삭제 정책을 제품 문구와 일치시킵니다.
- 전체 삭제는 journal, 세션, 관련 AI 메타데이터를 트랜잭션으로 처리합니다.

## AI 연동

- Cafe24 호출 코드는 하나의 client로 통합합니다.
- 모델을 `cafe24/auto`로 둘 때 실제 선택 모델을 메타데이터로 기록하되 사용자 원문은 로깅하지 않습니다.
- 네트워크 timeout, 429, 5xx, 잘린 응답, JSON 오류를 서로 다른 오류 코드로 구분합니다.
- 자동 재시도는 멱등한 실패에만 제한하고 지수 backoff를 적용합니다.
- 규칙 기반 답변과 실제 AI 답변을 UI에서 구분하되 불안감을 주는 기술 문구는 숨깁니다.
- 비용 보호를 위해 DB 기반 사용량 집계와 일별 상한을 둡니다.

## 인프라와 도메인

- GitHub `main` → Render 자동 배포를 단일 운영 파이프라인으로 사용합니다.
- Render custom domain 등록 후 안내받은 DNS 레코드만 가비아에 설정합니다.
- `www` 사용 여부와 대표 도메인을 하나로 정해 301 redirect합니다.
- HTTPS 발급 후에만 운영을 열고, 쿠키의 Secure 동작을 확인합니다.
- 환경변수는 Render Secret으로 관리하며 `.env`를 저장소에 올리지 않습니다.
- 배포 전 DB migration, 배포 후 `/api/ready`, 핵심 사용자 흐름 smoke test를 자동화합니다.

## 테스트 분리

```text
tests/unit/          만세력, 대운, 문구, merge, AI parser
tests/integration/   journal repository, API 권한, 충돌, 삭제
tests/e2e/           입력→결과→상담→저장→새로고침 복구
tests/smoke/         운영 health, 정적 파일, Cafe24 availability
```

필수 회귀 시나리오는 저장 충돌, DB 중단 후 복구, Cafe24 timeout/429/잘림, 쿠키 삭제, 모바일 360px, 개인정보 전체 삭제입니다.

## 구현 순서

### 1단계 — 구조 분리, 동작 유지

- 프론트 API/저장 모듈 분리
- 백엔드 route/service/repository 분리
- 오류 응답과 설정 로딩 통일
- Node를 유일한 운영 서버로 표시
- 기존 테스트가 그대로 통과해야 완료

### 2단계 — PostgreSQL 영속화

- migration과 DB 연결
- 파일 repository와 PostgreSQL repository의 계약 테스트
- 기존 JSON 파일 이관 도구
- `/api/ready`, 백업, 복구 코드

### 3단계 — 운영 안정화

- 공유 요청 제한, request ID, 구조화 로그, 오류 모니터링
- 배포 smoke test와 롤백 절차
- 저장·AI 실패 UX 점검

### 4단계 — 도메인 연결

- Render custom domain 등록
- 가비아 DNS 반영
- HTTPS, 쿠키, 저장, 삭제, AI 실제 호출 검증

### 5단계 — 필요할 때만 확장

- 선택적 로그인과 기기 간 동기화
- 선택·기록 기능 재활성화
- 프론트/백엔드 독립 배포는 트래픽 또는 팀 분리가 생긴 뒤 검토

## 완료 기준

- 재배포·재시작 후 기록이 유지됩니다.
- 쿠키를 잃어도 복구 코드 또는 계정으로 보관함을 복구할 수 있습니다.
- DB나 Cafe24 장애 시 입력을 잃지 않고 재시도할 수 있습니다.
- 개인정보 전체 삭제가 DB에서 검증됩니다.
- 360px 모바일에서 핵심 흐름이 깨지지 않습니다.
- 배포 대상과 데이터 저장소가 하나이며 문서·화면·실제 동작이 일치합니다.
