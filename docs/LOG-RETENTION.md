# 운영 로그 30일 보존

운영자 확인 기준 30일. 상담·계정·선택·결제 기록의 보존기간을 변경하지 않는다.

## DB

`usage_sessions`는 `completed_at` 또는 `started_at`, `llm_requests`와 `audit_logs`는 `created_at`이 30일 이상 지났을 때 삭제 대상이다. 세 테이블은 이용·진단·사용자 활동 기록이며 결제 원장이나 관리자 개인정보처리시스템 접속기록으로 사용하지 않는다.

서버 시작과 매시간 1,000행씩 작은 트랜잭션으로 처리하고, 한 테이블이라도 1,000행이 삭제되면 적체가 없을 때까지 이어서 처리한다. 동시 실행은 잠긴 행을 건너뛰며, 실패한 배치는 롤백된다. 삭제 건수와 오류 분류만 로그에 기록한다. 최근 AI 요청이 오래된 이용 이력을 참조하더라도 AI 요청의 자체 보존기간은 유지하며 참조만 해제한다.

대상 테이블의 날짜 인덱스는 `010_operational_log_retention` 마이그레이션에서 만든다. 개인정보처리방침의 30일 안내는 주기적 정리를 의미하며, 만료 시각에 모든 저장 매체가 동시에 삭제된다고 보장하지 않는다.

## 애플리케이션·웹 컨테이너

운영 배포는 컨테이너 교체 전에 `sudo bash deploy/logging/install.sh`를 실행한다. rsyslog·logrotate가 설치된 Ubuntu 호스트용이다. 설정을 검사하고, 전용 소켓 `/var/spool/rsyslog/saju.sock`이 준비된 뒤 컨테이너를 시작한다. AppArmor의 기존 허용 경로를 사용하며 보호 설정을 끄지 않는다.

Docker syslog 드라이버로 `/var/log/saju/containers.log`에만 전달하고 읽기 캐시는 비활성화한다. `docker logs` 대신 다음 서비스 전용 파일을 확인한다.

```sh
sudo tail -n 50 /var/log/saju/containers.log
sudo logrotate --debug /etc/logrotate.d/saju
systemctl status logrotate.timer
```

전용 규칙은 공유 시스템 syslog/journal로 전달하지 않는다. 로그 파일은 0640, 저장 폴더는 0750으로 제한한다. 일일 회전은 현재 파일과 29개 일일 아카이브로 30일 창을 구성하고 오래된 회전 파일을 제거한다. 빈 파일도 회전하므로 로그가 없는 날에도 과거 파일의 정리가 진행된다. 회전 후 rsyslog에 HUP를 보내 파일을 다시 연다. 호스트의 일일 타이머 동작을 모니터링해야 하며 시스템 중단·타이머 실패 시 지연될 수 있다.

## 기존 기록·백업과 제외 범위

공유 호스트의 SSH·관리자 접속기록, 프록시 및 DB 엔진 관리 로그, 외부 AI 제공자의 로그에는 이 설정이 적용되지 않는다. 다른 서비스의 기록이나 별도 법정 보존 기록을 일괄 삭제하지 않는다.

이번 점검에서 앱 DB의 30일 초과 운영 기록은 없었다. 기존 앱·웹 컨테이너는 새 배포에서 교체되지만, 외부 스냅샷·백업이나 별도 복사본까지 삭제된 것으로 보지 않는다.

백업 운영자가 장기 DB 백업을 만드는 경우 `pg_dump`의 `--exclude-table-data=public.usage_sessions`, `--exclude-table-data=public.llm_requests`, `--exclude-table-data=public.audit_logs` 옵션으로 운영 로그 데이터를 제외하고 스키마·상담·결제 기록은 별도로 보존할 수 있다. 운영 로그가 포함된 백업은 별도 보존·만료 기준을 맞춰야 한다. 실제 백업 위치와 운영 정책은 아직 확인되지 않았다.

로그가 포함된 기존 DB를 복원할 때에는 격리 환경에서 마이그레이션·서버 시작 정리를 먼저 실행하고 `operational.expired_logs_cleaned` 결과와 대상 테이블의 30일 초과 건수를 확인한 뒤 운영 트래픽을 연다. 백업 복원으로 오래된 운영 기록을 다시 장기 보관하지 않도록 한다.

참고 [Docker syslog](https://docs.docker.com/engine/logging/drivers/syslog/), [로그 캐시](https://docs.docker.com/engine/logging/dual-logging/), [rsyslog 소켓](https://docs.rsyslog.com/doc/configuration/modules/imuxsock.html).
