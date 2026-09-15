# 달빛 사주 운영 아키텍처

이 문서는 현재 코드에 실제로 구현된 구조를 기준으로 합니다. 회원 계정, 결제, PostgreSQL은 아직 구현되어 있지 않습니다.

실서비스 목표 구조와 프론트/백엔드/DB별 개선 항목은 [`IMPLEMENTATION-PLAN.md`](IMPLEMENTATION-PLAN.md)를 따릅니다.

## 운영 기준

브라우저와 API는 같은 도메인에서 제공합니다. 현재 Render를 유지하면 Render Custom Domain에 가비아 DNS를 연결하고, 회사 서버에 직접 올리면 Nginx가 HTTPS와 reverse proxy를 담당합니다. 두 방식을 동시에 운영하지 않습니다. 회사 서버 절차는 [`COMPANY-SERVER-DEPLOY.md`](COMPANY-SERVER-DEPLOY.md)에 있습니다.

```text
사용자 브라우저
  ├─ GET /, /assets/* ───────────────┐
  ├─ /api/journal ─ 기록 저장/복구   │
  ├─ /api/coach ─── AI 상담          ├─ Render Node Web Service
  └─ /api/epic ──── 대운 판독        │    ├─ 정적 파일 dist/client
                                     │    ├─ 파일 저장소 DALBIT_DATA_DIR
                                     │    └─ Cafe24 LLM Router
가비아 DNS ─ 사용자 도메인 ──────────┘
```

## 프론트엔드

- 기술: 바닐라 JavaScript, HTML, CSS. React/Vite 앱이 아니며 `VITE_API_BASE_URL`도 사용하지 않습니다.
- 빌드: `build.mjs`가 `src/client/app.js`, `src/client/engine.js`, CSS와 에셋을 `dist/client`로 번들·복사합니다.
- API: `/api/journal`, `/api/coach`, `/api/epic`을 상대 경로로 호출합니다.
- 계산: 만세력, 오행, 대운, 흐름 등 결정론적 계산은 브라우저의 `engine.js`, `constants.js`, `time.js`에서 수행합니다.
- 인증: 회원가입/로그인이 없습니다. 서버가 발급한 `dalbit_session` HttpOnly 쿠키로 브라우저별 기록을 구분합니다.
- AI 키: Cafe24 키는 브라우저에 전달하지 않습니다.

## 백엔드

- 실행 파일: `src/render-server.mjs`
- 런타임: Node.js 22, 기본 포트 `3000` (`PORT`로 변경)
- 역할: 정적 파일 제공, 세션 발급, 기록 저장, Cafe24 LLM 중계, 요청 제한

| 경로 | 메서드 | 역할 |
|---|---|---|
| `/api/health` | GET, HEAD | 서버·저장 방식·AI 연결 설정 상태 확인 |
| `/api/journal` | GET, PUT, DELETE | 현재 브라우저의 기록 조회·저장·전체 삭제 |
| `/api/coach` | GET, POST | AI 상담 연결 확인·응답 생성 |
| `/api/epic` | GET, POST | AI 대운 판독 연결 확인·응답 생성 |

쓰기 요청은 같은 출처인지 검사합니다. 기록은 revision 기반 낙관적 잠금으로 여러 탭의 덮어쓰기를 막고, 임시 파일 작성 후 rename하여 교체합니다. AI 요청 제한은 현재 프로세스 메모리에만 존재하므로 서버 재시작이나 수평 확장 시 공유되지 않습니다.

## 데이터 저장소

### 현재 Render 경로

- 형식: 세션 하나당 JSON 파일 하나
- 위치: `DALBIT_DATA_DIR`; 미지정 시 프로젝트의 `.data/`
- 식별자: 원본 쿠키를 SHA-256으로 해시한 파일명
- 한계: Render 무료 인스턴스의 로컬 파일은 재배포·재시작·슬립 때 사라질 수 있습니다.

실사용 전에는 아래 중 하나를 선택해야 합니다.

1. 빠른 출시: Render 유료 persistent disk를 붙이고 `DALBIT_DATA_DIR=/var/data/dalbit-saju`로 설정
2. 확장 가능한 운영: PostgreSQL용 저장소 어댑터를 새로 구현하고 기록·요청 제한을 DB로 이전

현재 저장 코드는 PostgreSQL에 자동 연결되지 않습니다. `DATABASE_URL`을 추가하는 것만으로 DB 전환되지 않습니다.

### Cloudflare 경로

`src/worker.js`, `wrangler.jsonc`, `drizzle/`에는 Cloudflare Worker + D1 실험 경로가 남아 있습니다. D1의 `journals` 저장은 구현되어 있지만 `/api/coach`, `/api/epic`은 구현되어 있지 않아 현재 Render 서비스와 기능이 동일하지 않습니다. 운영 배포 대상으로 사용하지 않습니다.

## 외부 서비스

- Cafe24 LLM Router: 서버의 `CAFE24_LLM_API_KEY`로만 호출
- 모델: `CAFE24_LLM_MODEL`; 기본값 `cafe24/auto`
- 실제 자동 선택 모델: Cafe24 응답의 model 값을 `shape.model`과 Render 로그에서 확인
- 장애 대응: AI를 사용할 수 없으면 프론트가 규칙 기반 안내로 폴백하며, 기록 입력은 화면에 유지됩니다.

## 환경 변수

| 변수 | 필수 | 설명 |
|---|---:|---|
| `PORT` | 호스팅 제공 | Node 수신 포트 |
| `DALBIT_DATA_DIR` | 운영 권장 | 기록 파일 디렉터리 |
| `CAFE24_LLM_API_KEY` | AI 사용 시 | 서버 전용 API 키 |
| `CAFE24_LLM_MODEL` | 아니오 | 기본 `cafe24/auto` |
| `CAFE24_LLM_BASE_URL` | 아니오 | 별도 Router 엔드포인트 사용 시 |

호환용 별칭 `LLM_ROUTER_KEY`, `LLM_ROUTER_URL`도 코드에서 인식하지만 새 설정에는 Cafe24 이름을 사용합니다. 값 예시는 루트의 `.env.example`에 있습니다.

## 배포 흐름

```text
GitHub main push
  → Render: npm ci && npm run build
  → Render: npm start
  → Node가 dist/client와 /api/*를 함께 제공
  → Render custom domain에 가비아 DNS 연결
```

회사 서버 직접 배포에서는 `Nginx :443 → Node 127.0.0.1:3000`이 앞에 추가됩니다. 저장·쿠키가 갈리지 않도록 Render와 회사 서버 중 하나만 대표 운영 서버로 선택합니다.

## 가비아 연결 전 필수 체크

- [ ] Render 운영 서비스를 Web Service로 유지
- [ ] 저장 정책 선택: persistent disk 또는 PostgreSQL 어댑터 구현
- [ ] `CAFE24_LLM_API_KEY`와 모델 설정 확인
- [ ] Render에 사용자 도메인 추가 후 안내된 DNS 레코드를 가비아에 등록
- [ ] HTTPS 발급 완료 후 `https://사용자도메인/api/health` 확인
- [ ] 사용자 도메인에서 기록 저장→새로고침→복구→삭제 확인
- [ ] 상담과 대운 판독 각각 실제 응답 및 실패 폴백 확인
- [ ] 기존 `onrender.com` 주소를 함께 쓸 경우 기록이 도메인별 쿠키로 갈린다는 점 확인

## 다음 구조 변경 우선순위

1. 운영 데이터 영속화
2. 세션 기반 요청 제한을 공유 저장소로 이전
3. 필요할 때만 계정/기기 간 동기화 도입
4. Cloudflare 경로를 완성하거나 제거해 배포 대상을 하나로 유지
