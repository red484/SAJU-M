# 달빛 사주 운영 아키텍처

## 운영 기준

운영 대상은 Lightsail의 Docker Compose 한 벌입니다. Toss 로그인·IAP·광고·이용권은 포함하지 않습니다.

```text
가비아 DNS
  → 공용 Lightsail Nginx (TLS)
      ├─ /api/* → saju-backend:9090 (Node)
      │             ├─ PostgreSQL
      │             └─ Cafe24 LLM Router
      └─ /*      → saju-web:80 (Nginx, dist/client)
```

Cloudflare Worker/D1 배포 경로는 제거했습니다. 로컬 `npm run dev`만 개발 편의를 위해 Node가 정적 파일과 파일 repository를 함께 제공합니다.

## 프론트엔드

- 위치: `src/client`
- 기술: 바닐라 JavaScript, HTML, CSS
- 빌드 결과: `dist/client`
- API: 같은 도메인의 `/api/journal`, `/api/coach`, `/api/epic`
- 책임: 만세력 계산, 화면, 저장 충돌 병합, AI 실패 복구 UX
- 운영 제공자: `saju-web` Nginx 컨테이너

## 백엔드

- 운영 진입점: `server/index.mjs`
- API 조립: `src/server/api-handler.mjs`
- route: `src/server/routes`
- service: `src/server/services`
- repository: `src/server/repositories`
- 외부 연동: `src/server/integrations`
- 운영 포트: 컨테이너 내부 `9090`

| 경로 | 역할 |
|---|---|
| `/health`, `/api/health` | 프로세스와 AI 설정 상태 |
| `/api/ready` | PostgreSQL 연결 준비 상태 |
| `/api/journal` | 보관함 조회·revision 저장·삭제 |
| `/api/coach` | Cafe24 AI 상담 |
| `/api/epic` | Cafe24 대운 판독 |

## PostgreSQL

backend 시작 시 `server/migrations`를 순서대로 자동 실행합니다.

| 테이블 | 용도 |
|---|---|
| `app_users` | 향후 선택적 계정 연결 자리; 현재 로그인 없음 |
| `anonymous_sessions` | 익명 HttpOnly 쿠키의 해시 식별자 |
| `saju_journals` | 프로필·상담·기록 JSONB와 revision |
| `usage_sessions` | 상담/대운 호출 단위 상태 |
| `llm_requests` | 공급자·모델·키 라벨·토큰·지연·오류 |
| `audit_logs` | 저장·삭제 감사 이벤트 |
| `schema_migrations` | 적용된 migration |

사용자 원문과 생년월일은 일반 로그나 `llm_requests`에 복제하지 않습니다. 보관함 payload에만 존재합니다.

## Cafe24 LLM

- 단일 키: `CAFE24_LLM_API_KEY`
- 보조 키: `CAFE24_LLM_API_KEYS` 쉼표 목록
- 안전한 로그 이름: `CAFE24_LLM_KEY_LABELS`
- 모델: `CAFE24_LLM_MODEL`, 기본 `cafe24/auto`
- 키 폴백: 429, 500, 502, 503, 504에서 다음 키 시도
- 실제 선택 모델과 사용량은 응답 shape 및 DB 메타데이터로 기록

## 컨테이너

| 서비스 | 이미지 target | 역할 |
|---|---|---|
| `db-init` | `db-init` | 공용 PostgreSQL에 앱 role/database 생성 |
| `backend` | `backend` | migration과 API |
| `web` | `web` | 정적 파일과 내부 API proxy |

모두 외부 `levelup-net`을 사용합니다. 공용 Lightsail Nginx도 이 network에 연결되어야 컨테이너 이름으로 접근할 수 있습니다.

## 개발과 운영의 차이

| 항목 | 로컬 개발 | 운영 |
|---|---|---|
| 실행 | `npm run dev` | `docker compose ... up` |
| 정적 파일 | Node | `saju-web` Nginx |
| API | Node | `saju-backend` Node |
| 저장 | `.data` 파일 | PostgreSQL |
| TLS | 없음 | 공용 Lightsail Nginx |

## 배포 파일

- `Dockerfile`
- `docker-compose.prd.yml`
- `deploy/container-nginx/default.conf`
- `deploy/lightsail/nginx/saju.conf`
- `scripts/init_production_database.sh`
- `.env.production.example`

실제 서버 절차는 [`COMPANY-SERVER-DEPLOY.md`](COMPANY-SERVER-DEPLOY.md)를 따릅니다.
