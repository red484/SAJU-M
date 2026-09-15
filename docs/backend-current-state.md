# 백엔드 현재 상태

기준: 2026-09-15, commit `a8d6175` 이후 문서화 시점.

## 구현 현황

| 영역 | 상태 | 근거/메모 |
|---|---|---|
| 프론트·백엔드 컨테이너 분리 | 완료 | `Dockerfile`, `docker-compose.prd.yml` |
| 동일 도메인 `/api` 프록시 | 완료 | container/external Nginx 설정 |
| PostgreSQL migration | 구현 완료 | `server/db.mjs`, `server/migrations/001_initial.sql` |
| 익명 journal CRUD | 완료 | revision 충돌 방지 포함 |
| Cafe24 다중 키 fallback | 완료 | 일시 오류에 다음 키 사용 |
| 사용량·AI·감사 telemetry | 완료 | 원문 제외 |
| Cloudflare D1/Render 이중 운영 제거 | 완료 | 운영 경로를 Lightsail로 통일 |
| 회원가입·로그인 | 미구현 | `app_users`는 미래 연결용 |
| 결제·이용권·Toss | 범위 제외 | 이번 구조에 포함하지 않음 |
| 공유 rate limit | 미구현 | 현재 프로세스 메모리 기반 |
| 실서버 DB migration 실행 | 미검증 | 회사 비밀값과 서버 접근 필요 |
| 실제 Docker image build | 미검증 | 개발 환경 Docker daemon 미실행 |

## 검증 기록

| 검사 | 결과 |
|---|---|
| `npm run build` | 통과 |
| `npm test` | 통과 |
| 로컬 health/smoke | 통과 |
| journal 저장 통합 테스트 | 통과 |
| Cafe24 fallback 테스트 | 통과 |
| compose 설정 렌더링 | 통과 |
| `npm audit --omit=dev` | 취약점 0건 |

## 실서비스 전 남은 결정

1. 실제 서비스 도메인과 TLS 인증서 경로 확정
2. PostgreSQL 백업·복구와 보존기간 확정
3. 익명 쿠키 삭제 시 데이터 복구 정책 결정
4. 다중 backend가 필요하면 Redis rate limiter 도입
5. 개인정보 처리방침·이용약관을 실제 수집 항목과 맞춰 법무 검토

