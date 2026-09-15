# 실서비스 구현 현황

## 완료

- [x] `src/client`, `src/server` 모듈 분리
- [x] Docker `web`, `backend`, `db-init` target
- [x] Lightsail 운영 compose와 공용 `levelup-net`
- [x] 컨테이너 Nginx와 회사 도메인 외부 Nginx 설정
- [x] Cloudflare Worker/D1 경로 제거
- [x] PostgreSQL migration runner
- [x] 익명 세션·보관함 JSONB·revision 충돌 처리
- [x] AI 사용 세션·요청 메타데이터·감사 로그
- [x] Cafe24 다중 키의 일시 오류 fallback
- [x] health/readiness와 배포 smoke test

## 운영 연결 시 필요

- [ ] 실제 `POSTGRES_ADMIN_URL`, `POSTGRES_URL` 발급
- [ ] 공용 PostgreSQL과 `levelup-net` 연결 확인
- [ ] 실제 Cafe24 키를 서버 secret에 등록
- [ ] `saju.ashwoodfriends.com`이 맞는지 확정
- [ ] 가비아 A 레코드를 Lightsail 고정 IP로 연결
- [ ] TLS 인증서 발급 및 외부 Nginx reload
- [ ] 운영 smoke test와 사용자 흐름 검증
- [ ] PostgreSQL 자동 백업과 복구 훈련

## 다음 개선

- [ ] 익명 보관함 복구 코드
- [ ] DB 기반 공유 rate limit
- [ ] 오류 모니터링과 운영 대시보드
- [ ] JSON 파일에 남아 있는 기존 사용자 데이터의 일회성 이관 도구

## 명시적 제외

Toss 로그인, Apps in Toss SDK/AIT, IAP, 광고, 구매 주문, 이용권과 차감 기능은 구현하지 않습니다.
