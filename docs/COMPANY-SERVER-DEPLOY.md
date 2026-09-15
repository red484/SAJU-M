# 회사 도메인 + Nginx 배포

이 문서는 Ubuntu 계열 회사 서버 한 대에 Node 앱과 Nginx를 함께 운영하는 기준입니다. 회사 도메인은 아직 확정값을 받지 않았으므로 예시의 `saju.company.example`을 실제 값으로 바꿔야 합니다.

> Render를 계속 쓸 경우 Nginx 설치 단계는 생략합니다. 가비아 DNS에서 Render가 Custom Domain 화면에 안내하는 레코드로 연결하면 됩니다. 아래 절차는 회사가 관리하는 VM/VPS에 직접 배포할 때만 사용합니다.

## 요청 흐름

```text
사용자 → 가비아 DNS → Nginx :443 → Node 127.0.0.1:3000
                                      ├─ /와 assets
                                      ├─ /api/journal
                                      ├─ /api/coach
                                      └─ /api/epic
```

Node 포트는 외부에 열지 않습니다. 방화벽은 SSH, HTTP, HTTPS만 허용합니다.

## 1. DNS

가비아 DNS 관리에서 다음 중 서버 구성에 맞는 레코드를 등록합니다.

| 유형 | 이름 | 값 |
|---|---|---|
| A | `saju` 또는 `@` | 회사 서버의 고정 IPv4 |
| AAAA | 동일 | 회사 서버의 고정 IPv6가 있을 때만 |
| CNAME | `www` | 대표 도메인 |

대표 도메인은 하나만 정하고 나머지는 301 redirect합니다. DNS 반영 전에 서버 IP가 고정인지 확인합니다.

## 2. 서버 계정과 디렉터리

```sh
sudo useradd --system --home /srv/dalbit-saju --shell /usr/sbin/nologin dalbit
sudo mkdir -p /srv/dalbit-saju/current /var/lib/dalbit-saju /var/www/certbot
sudo chown -R dalbit:dalbit /srv/dalbit-saju /var/lib/dalbit-saju
```

프로젝트를 `/srv/dalbit-saju/current`에 배치하고 다음을 실행합니다.

```sh
sudo -u dalbit npm ci
sudo -u dalbit npm run build
```

## 3. 서버 환경 변수

`/etc/dalbit-saju.env`를 root만 읽을 수 있게 만듭니다.

```dotenv
HOST=127.0.0.1
PORT=3000
DALBIT_DATA_DIR=/var/lib/dalbit-saju
CAFE24_LLM_API_KEY=실제_비밀키
CAFE24_LLM_MODEL=cafe24/auto
```

```sh
sudo chown root:root /etc/dalbit-saju.env
sudo chmod 600 /etc/dalbit-saju.env
```

현재는 파일 저장 방식입니다. PostgreSQL 전환 전까지 `/var/lib/dalbit-saju`를 정기 백업해야 합니다.

## 4. systemd

```sh
sudo cp deploy/systemd/dalbit-saju.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now dalbit-saju
sudo systemctl status dalbit-saju
curl --fail http://127.0.0.1:3000/api/health
```

Node 실행 파일이 `/usr/bin/npm`이 아닌 서버라면 `command -v npm` 결과에 맞춰 unit의 `ExecStart`를 바꿉니다.

## 5. Nginx와 최초 인증서

`deploy/nginx/dalbit-saju-http.conf`의 `__APP_DOMAIN__`을 실제 도메인으로 교체한 뒤 활성화합니다.

```sh
sudo cp deploy/nginx/dalbit-saju-http.conf /etc/nginx/sites-available/dalbit-saju
sudo editor /etc/nginx/sites-available/dalbit-saju
sudo ln -s /etc/nginx/sites-available/dalbit-saju /etc/nginx/sites-enabled/dalbit-saju
sudo nginx -t
sudo systemctl reload nginx
```

DNS가 서버를 가리키는 것을 확인한 뒤 Certbot으로 인증서를 발급합니다.

```sh
sudo certbot certonly --webroot -w /var/www/certbot -d saju.company.example
```

이후 `deploy/nginx/dalbit-saju-https.conf`로 교체하고 같은 자리표시자를 실제 도메인으로 바꿉니다.

```sh
sudo cp deploy/nginx/dalbit-saju-https.conf /etc/nginx/sites-available/dalbit-saju
sudo editor /etc/nginx/sites-available/dalbit-saju
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

HTTPS 설정은 Cafe24의 긴 응답을 위해 API timeout을 75초로 두고, 요청 본문은 1MB로 제한하며, 프록시 헤더를 전달합니다. Node는 이 헤더를 이용해 사용자 도메인의 same-origin 요청과 Secure 쿠키를 판정합니다.

## 6. 배포 후 검증

```sh
SMOKE_BASE_URL=https://saju.company.example npm run smoke
curl -I https://saju.company.example/
curl https://saju.company.example/api/health
```

브라우저에서는 다음을 직접 확인합니다.

- 생년월일 입력 → 결과 생성
- AI 상담과 대운 판독
- 새로고침 후 기록 복구
- 다른 탭 동시 저장 충돌
- 개인정보 전체 삭제
- 모바일 360px 레이아웃
- 개발자 도구에서 `dalbit_session`에 `HttpOnly`, `Secure`, `SameSite=Strict` 적용

## 7. 업데이트와 롤백

배포 시 `npm ci`, `npm run build`, `npm test`를 통과시킨 뒤 서비스를 재시작합니다.

```sh
sudo systemctl restart dalbit-saju
sudo journalctl -u dalbit-saju -n 100 --no-pager
SMOKE_BASE_URL=https://saju.company.example npm run smoke
```

운영에서는 `current`를 릴리스 디렉터리의 심볼릭 링크로 관리하면 이전 릴리스로 빠르게 되돌릴 수 있습니다. 데이터 디렉터리는 코드 릴리스 밖의 `/var/lib/dalbit-saju`에 유지합니다.
