# SAJU-M 기술 문서

이 문서는 2026-09-15 `main`의 실제 구현을 기준으로 한다. 프론트 디자인과 사주 계산은 브라우저에, 기록·AI·운영 데이터는 회사 서버에 둔다. 현재 로그인·결제·이용권·Toss 기능은 없다.

| 문서 | 내용 |
|---|---|
| [frontend.md](frontend.md) | 화면, 계산 엔진, 상태, API 호출 |
| [backend.md](backend.md) | API, 서비스, 저장소, 보안, AI |
| [database.md](database.md) | PostgreSQL ERD, 테이블·인덱스·보존 원칙 |
| [frontend-backend-boundary.md](frontend-backend-boundary.md) | 양쪽 책임과 API 계약 |
| [backend-current-state.md](backend-current-state.md) | 구현/검증/미완료 현황 |
| [backend-deploy.md](backend-deploy.md) | Lightsail Docker 배포와 점검 |
| [incident-lessons.md](incident-lessons.md) | 장애 예방 원칙과 복구 기준 |
| [team-brief.md](team-brief.md) | 짧은 인수인계 요약 |

기존의 큰 그림은 [ARCHITECTURE.md](ARCHITECTURE.md), 단계별 회사 서버 설치법은 [COMPANY-SERVER-DEPLOY.md](COMPANY-SERVER-DEPLOY.md)에 있다.
