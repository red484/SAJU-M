# 장애 예방과 교훈

| 위험 | 현재 방어 | 남은 개선 |
|---|---|---|
| 운영 저장 경로가 둘로 갈림 | Lightsail/PostgreSQL 하나로 통일 | 옛 배포 환경 완전 종료 확인 |
| 브라우저에서 비밀 키 노출 | Cafe24 호출을 backend로 한정 | CI secret scan 추가 |
| 다른 탭이 기록 덮어씀 | revision 기반 409 충돌 | 사용자 병합 UI 개선 |
| DB는 죽었는데 프로세스는 살아 있음 | `/api/ready`가 실제 DB 질의 | 외부 uptime alert 연결 |
| AI 장애가 전체 앱 장애로 번짐 | 규칙 기반 결과와 오류 격리 | 공급자별 circuit breaker |
| 키 값이 로그에 남음 | 안전한 key label만 기록 | 로그 redaction 자동 검사 |
| 단일 프로세스 rate limit 우회 | 세션별 메모리 제한 | Redis 등 공유 limiter |
| 익명 쿠키 분실로 기록 접근 불가 | 현재 복구 수단 없음 | 계정 연결 또는 recovery code 결정 |

## 장애 대응 순서

1. `/health`와 `/api/ready`를 분리해서 확인한다.
2. `saju-web`, `saju-backend`, `db-init` 상태와 최근 로그를 확인한다.
3. DB 연결, migration 적용, Cafe24 공급자 오류를 각각 분리한다.
4. 사용자 원문 대신 request 상태·error code·latency로 범위를 좁힌다.
5. 조치한 commit과 배포 시각, 영향 범위, 재발 방지 항목을 남긴다.

DB가 준비되지 않았는데 정적 화면만 정상인 상태를 “서비스 정상”으로 판단하면 안 된다. 반대로 Cafe24만 장애일 때는 만세력·기록까지 함께 내리지 않는다.

