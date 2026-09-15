# 백엔드 배포와 운영

상세 명령은 [COMPANY-SERVER-DEPLOY.md](COMPANY-SERVER-DEPLOY.md), 전체 구성은 [ARCHITECTURE.md](ARCHITECTURE.md)를 따른다.

## 배포 구성

| 구성요소 | 역할 | 외부 공개 |
|---|---|---|
| Lightsail Nginx | TLS 종료, 도메인 라우팅 | 80/443 |
| `saju-web` | 정적 파일, 내부 API 프록시 | localhost 19100 |
| `saju-backend` | journal·AI API | localhost 19101 |
| 공용 PostgreSQL | 영구 저장 | 공개 금지 |
| `db-init` | DB/role 준비 후 종료 | 공개 금지 |

## 배포 전 체크

- `main`의 배포할 commit SHA를 기록한다.
- `.env.production.example`에서 서버 전용 `.env.production`을 만들고 권한을 제한한다.
- `POSTGRES_ADMIN_URL`, `POSTGRES_URL`, Cafe24 키를 소스와 로그에 노출하지 않는다.
- `deploy/lightsail/nginx/saju.conf`의 도메인과 인증서 경로를 실제 값으로 맞춘다.
- 공용 Docker network `levelup-net` 존재 여부를 확인한다.

## 배포 순서

```sh
npm ci
npm test
npm run build
docker compose --env-file .env.production -f docker-compose.prd.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prd.yml ps
```

그 뒤 외부 Nginx 설정을 검사하고 reload한다. DB 초기화는 `db-init` 성공 뒤 backend가 뜨고, backend readiness 성공 뒤 web이 뜬다.

## 배포 후 확인

| 확인 | 기대값 |
|---|---|
| `GET /health` | `200`, `ok: true` |
| `GET /api/ready` | `200`, `ready: true` |
| 홈 화면 | 정적 자산 200, 콘솔 오류 없음 |
| journal 저장 후 새로고침 | 동일 기록 복원 |
| AI 미설정 | 상태가 unavailable이며 계산 화면 정상 |
| AI 설정 | 상담/대운 판독 성공, telemetry 생성 |
| HTTPS | 유효한 인증서, HTTP는 HTTPS로 이동 |

## 롤백

애플리케이션은 직전 정상 commit으로 재빌드한다. 이미 적용된 DB migration은 자동으로 되돌리지 않는다. 파괴적 스키마 변경은 확장→전환→정리 순으로 별도 migration을 설계하고, 롤백 전에 DB 백업을 확인한다.

