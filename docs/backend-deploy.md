# 백엔드 배포와 운영

상세 명령은 [COMPANY-SERVER-DEPLOY.md](COMPANY-SERVER-DEPLOY.md), 전체 구성은 [ARCHITECTURE.md](ARCHITECTURE.md)를 따른다.

## 배포 구성

| 구성요소 | 역할 | 외부 공개 |
|---|---|---|
| Lightsail Nginx | TLS 종료, 도메인 라우팅 | 80/443 |
| `saju-web` | 정적 파일, 내부 API 프록시 | localhost 19100 |
| `saju-backend` | journal·AI API | localhost 19101 |
| `saju-db` 전용 PostgreSQL | 영구 저장 | 공개 금지 |
| `db-init` | DB/role 준비 후 종료 | 공개 금지 |

## 배포 전 체크

- `main`의 배포할 commit SHA를 기록한다.
- `.env.production.example`에서 서버 전용 `.env.production`을 만들고 권한을 제한한다.
- `POSTGRES_ADMIN_URL`, `POSTGRES_URL`, Cafe24 키를 소스와 로그에 노출하지 않는다.
- `deploy/lightsail/nginx/saju.conf`의 도메인과 인증서 경로를 실제 값으로 맞춘다.
- 공용 Docker network `levelup-net` 존재 여부를 확인한다.

Apple 로그인 키는 `.p8` 파일을 `APPLE_PRIVATE_KEY_B64`로 전달할 수 있다. 기존
`APPLE_PRIVATE_KEY`보다 이 값을 우선 사용한다. 맥에서 실제 파일명을 넣어
`base64 < /path/to/AuthKey_XXXXXXXXXX.p8 | tr -d '\n' | pbcopy`를 실행한 뒤,
서버의 `.env.production`에 `APPLE_PRIVATE_KEY_B64=붙여넣은값`으로 저장한다.
키와 인코딩된 값은 로그·채팅·Git에 올리지 않는다. 재배포 후 아래 명령은 키를
출력하지 않고 PKCS#8 파싱 결과만 확인한다.

```sh
docker exec saju-backend node --input-type=module -e '
import { importPKCS8 } from "jose";
const raw = process.env.APPLE_PRIVATE_KEY_B64;
const key = raw ? Buffer.from(raw, "base64").toString("utf8").trim() :
  (process.env.APPLE_PRIVATE_KEY || "").trim().replace(/\\n/g, "\n");
try { await importPKCS8(key, "ES256"); console.log("Apple key: OK"); }
catch { console.error("Apple key: invalid PKCS#8"); process.exitCode = 1; }
'
```

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
