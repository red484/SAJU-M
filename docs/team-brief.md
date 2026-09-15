# 팀 브리프

SAJU-M은 브라우저에서 사주 계산과 화면을 만들고, Node backend가 기록·AI·운영 로그를 맡는 서비스다. 운영 기준은 Lightsail Docker와 공용 PostgreSQL 하나다.

## 담당별 시작점

| 담당 | 먼저 읽을 문서 | 주요 코드 |
|---|---|---|
| 프론트 | [frontend.md](frontend.md) | `src/client/*` |
| 백엔드 | [backend.md](backend.md) | `server/*`, `src/server/*` |
| DB | [database.md](database.md) | `server/migrations/*` |
| 배포 | [backend-deploy.md](backend-deploy.md) | `Dockerfile`, `docker-compose.prd.yml`, `deploy/*` |

## 지금 지켜야 할 합의

- React 전환은 필요하지 않다.
- Toss 로그인·결제·이용권은 현재 범위가 아니다.
- Cloudflare D1이나 Render JSON 저장 경로를 다시 만들지 않는다.
- 계산 엔진은 네트워크 없이 같은 입력에 같은 결과를 내야 한다.
- 운영 secret과 사용자 원문을 로그에 남기지 않는다.
- 스키마 변경은 새 migration으로만 한다.
- 배포 완료 판단은 화면뿐 아니라 `/api/ready`와 journal 왕복으로 한다.

