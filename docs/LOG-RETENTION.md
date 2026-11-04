# 운영 로그 30일 보존

운영자 확인 기준 30일. 상담·계정·선택·결제 기록의 보존기간을 변경하지 않는다.

## DB

`usage_sessions`는 `completed_at` 또는 `started_at`, `llm_requests`와 `audit_logs`는 `created_at`이 30일 이상 지났을 때 삭제 대상이다. 세 테이블은 이용·진단·사용자 활동 기록이며 결제 원장이나 관리자 개인정보처리시스템 접속기록으로 사용하지 않는다.

서버 시작과 매시간 1,000행씩 작은 트랜잭션으로 처리하고, 한 테이블이라도 1,000행이 삭제되면 적체가 없을 때까지 이어서 처리한다. 동시 실행은 잠긴 행을 건너뛰며, 실패한 배치는 롤백된다. 삭제 건수와 오류 분류만 로그에 기록한다. 최근 AI 요청이 오래된 이용 이력을 참조하더라도 AI 요청의 자체 보존기간은 유지하며 참조만 해제한다.

대상 테이블의 날짜 인덱스는 `010_operational_log_retention` 마이그레이션에서 만든다. 개인정보처리방침의 30일 안내는 주기적 정리를 의미하며, 만료 시각에 모든 저장 매체가 동시에 삭제된다고 보장하지 않는다.

## 애플리케이션·웹·전용 DB 컨테이너와 호스트 프록시

운영 배포는 컨테이너 교체 전에 `sudo bash deploy/logging/install.sh`를 실행한다. rsyslog·logrotate가 설치된 Ubuntu 호스트용이다. 설정을 검사하고, 전용 소켓 `/var/spool/rsyslog/saju.sock`이 준비된 뒤 컨테이너를 시작한다. AppArmor의 기존 허용 경로를 사용하며 보호 설정을 끄지 않는다.

Docker syslog 드라이버로 `/var/log/saju/containers.log`에만 전달하고 읽기 캐시는 비활성화한다. `docker logs` 대신 다음 서비스 전용 파일을 확인한다.

```sh
sudo tail -n 50 /var/log/saju/containers.log
sudo logrotate --debug /etc/logrotate.d/saju
systemctl status logrotate.timer
```

전용 규칙은 공유 시스템 syslog/journal로 전달하지 않는다. 로그 파일은 0640, 저장 폴더는 0750으로 제한한다. 일일 회전은 현재 파일과 29개 일일 아카이브로 30일 창을 구성하고 오래된 회전 파일을 제거한다. 빈 파일도 회전하므로 로그가 없는 날에도 과거 파일의 정리가 진행된다. 회전 후 rsyslog에 HUP를 보내 파일을 다시 연다. 호스트의 일일 타이머 동작을 모니터링해야 하며 시스템 중단·타이머 실패 시 지연될 수 있다.

## 기존 기록·백업과 제외 범위

삶의 온기 전용 DB 컨테이너와 전용 호스트 프록시 로그까지 30일 관리 경로로 분리했다. 공유 호스트의 SSH·관리자 접속기록, 다른 서비스의 프록시·DB 엔진 로그와 외부 AI 제공자의 로그에는 이 설정이 적용되지 않는다. 다른 서비스의 기록이나 별도 법정 보존 기록을 일괄 삭제하지 않는다.

이번 점검에서 앱 DB의 30일 초과 운영 기록은 없었다. 기존 앱·웹 컨테이너는 새 배포에서 교체되지만, 외부 스냅샷·백업이나 별도 복사본까지 삭제된 것으로 보지 않는다.

백업 운영자가 장기 DB 백업을 만드는 경우 `pg_dump`의 `--exclude-table-data=public.usage_sessions`, `--exclude-table-data=public.llm_requests`, `--exclude-table-data=public.audit_logs` 옵션으로 운영 로그 데이터를 제외하고 스키마·상담·결제 기록은 별도로 보존할 수 있다. 운영 로그가 포함된 백업은 별도 보존·만료 기준을 맞춰야 한다. 사용자는 서버 스냅샷 보존기간이 실제로 30일로 설정되어 있다고 확인하고 재조회를 생략하도록 지시했다. 이 값은 운영자 확인으로 기록하며, AWS API·콘솔에서 직접 검증한 것으로 표시하지 않는다. 그 밖의 외부 저장본 위치와 정책은 확인되지 않았다.

로그가 포함된 기존 DB를 복원할 때에는 격리 환경에서 마이그레이션·서버 시작 정리를 먼저 실행하고 `operational.expired_logs_cleaned` 결과와 대상 테이블의 30일 초과 건수를 확인한 뒤 운영 트래픽을 연다. 백업 복원으로 오래된 운영 기록을 다시 장기 보관하지 않도록 한다.

참고 [Docker syslog](https://docs.docker.com/engine/logging/drivers/syslog/), [로그 캐시](https://docs.docker.com/engine/logging/dual-logging/), [rsyslog 소켓](https://docs.rsyslog.com/doc/configuration/modules/imuxsock.html).


## 2026년 11월 4일 공유 호스트 점검·적용

| 대상 | 점검 결과 | 처리 |
| --- | --- | --- |
| 서버 스냅샷 | 운영자가 실제 보존기간 30일 확인, 재조회 생략 요청 | 설정 변경·삭제 없이 확인 사실 기록 |
| 로컬 백업 작업 | root·ubuntu crontab, 시스템 타이머와 서비스 경로에서 이 서비스의 DB 덤프/WAL 아카이브 작업을 발견하지 못함 | 발견되지 않았다는 의미이며 외부 복사본 부재를 증명하지 않음 |
| 전용 PostgreSQL | `saju-db`, `postgres`·`saju` DB, stderr → 무제한 json-file | 기존 이미지와 데이터 볼륨을 고정한 채 서비스 syslog로 전환, 별도 Docker 캐시 제거 |
| 서비스 도메인 Nginx | 공용 access/error 파일 상속 | 전용 host-access.log·host-error.log로 분리, 일일 29개 아카이브 회전. 호스트·웹 컨테이너 접근 로그의 쿼리 문자열·리퍼러 제외 |
| 공유 Nginx 로그 | 일일 14회 회전 | 다른 서비스가 섞인 기존 파일과 설정 유지 |
| 공유 rsyslog | 주간 4회 회전 | SSH·관리자·다른 서비스 기록이 섞여 있어 전역 보존 축소를 하지 않음 |
| 공유 journald | 명시적 MaxRetentionSec 없음, 약 32MB 사용 | 다른 서비스와 관리 로그를 일괄 vacuum하지 않음 |

새 서비스별 로그는 공용 syslog/journal로 전달하지 않으며 전용 일일 회전 정책을 따른다. 기존 공용 파일은 서비스별 출처를 신뢰성 있게 분리하기 어려우므로 다른 서비스 기록과 함께 삭제하지 않았다.

`apply-database-logs.sh`는 현재 DB 이미지 ID·프로젝트·데이터 볼륨을 검사하고, 보존되는 동일 이미지와 볼륨으로만 로깅 설정을 바꾼다. 준비 상태 확인에 실패하면 이전 로깅 설정으로 복귀한다. 이미 적용돼 있으면 DB를 재시작하지 않는다. 서버 전용 `docker-compose.db.yml`·`.env.db`의 내용은 출력하거나 저장소에 넣지 않는다.

`apply-host-proxy-logs.sh`는 전용 `saju.ashwoodfriends.com` 가상 호스트만 수정하고 `nginx -t`가 성공해야 reload한다. 다른 도메인이 섞인 파일이나 기존 별도 로그 설정은 자동 변경을 거부한다. 같은 설정으로 재실행하면 reload하지 않는다. 설치 파일 경로는 `deploy/logging/`에 있고 자동·수동 배포 모두 동일한 절차를 사용한다.

운영 검증에서 DB 이미지·볼륨·계정/보관함/이용권 관련 행 수가 유지됐고, DB 로그가 전용 파일에 수신됨을 확인했다. 호스트 프록시는 실제 요청이 전용 파일에 기록되고 시험 쿼리 문자열이 기록되지 않음을 확인했다. 서비스 로그의 파일 권한은 0640이다.
