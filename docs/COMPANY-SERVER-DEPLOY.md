# Lightsail 회사 도메인 배포

알오와 같은 Lightsail 공용 PostgreSQL·공용 Docker network·외부 Nginx를 전제로 합니다. Toss 관련 설정은 필요 없습니다.

## 1. 환경 변수

```sh
cp .env.production.example .env.production
chmod 600 .env.production
```

필수값은 공용 DB 관리자 접속 문자열 `POSTGRES_ADMIN_URL`, SAJU-M 전용 `POSTGRES_URL`, Cafe24 키입니다. 앱 DB 비밀번호는 임의의 긴 16진수로 생성합니다. `.env.production`은 커밋하지 않습니다.

## 2. 공용 network

```sh
docker network inspect levelup-net >/dev/null 2>&1 || docker network create levelup-net
```

공용 PostgreSQL과 외부 Nginx도 `levelup-net`에 연결되어 있어야 합니다.

## 3. 빌드와 기동

```sh
docker compose --env-file .env.production -f docker-compose.prd.yml config
docker compose --env-file .env.production -f docker-compose.prd.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prd.yml ps
docker compose --env-file .env.production -f docker-compose.prd.yml logs --tail=100 backend
```

`db-init`가 전용 role/database를 만든 뒤 backend가 migration을 적용합니다. DB가 준비되어야 web 컨테이너가 시작됩니다.

## 4. 회사 도메인과 Nginx

기본 템플릿은 `saju.ashwoodfriends.com`입니다. 실제 회사 서브도메인이 다르면 `deploy/lightsail/nginx/saju.conf`의 두 `server_name`과 인증서 경로를 함께 바꿉니다.

외부 Nginx 설정 저장소에 설정을 반영하고 인증서를 발급합니다. 가비아 DNS에는 해당 서브도메인의 A 레코드를 Lightsail 고정 IP로 지정합니다. 외부 Nginx가 Docker 컨테이너라면 `levelup-net`에 연결되어야 `saju-web`, `saju-backend` 이름을 찾습니다.

## 5. 검증

```sh
curl --fail https://saju.ashwoodfriends.com/health
curl --fail https://saju.ashwoodfriends.com/api/ready
SMOKE_BASE_URL=https://saju.ashwoodfriends.com npm run smoke
```

브라우저에서 입력→결과, 상담, 대운 판독, 저장→새로고침 복구, 여러 탭 충돌 병합, 전체 삭제와 Secure 쿠키를 확인합니다.

## 6. 업데이트

```sh
git pull --ff-only
npm ci
npm run build
npm test
docker compose --env-file .env.production -f docker-compose.prd.yml up -d --build
SMOKE_BASE_URL=https://saju.ashwoodfriends.com npm run smoke
```

적용된 migration 파일은 수정하지 않고 다음 번호의 SQL 파일을 추가합니다.

## 제외 범위

- Toss 로그인
- Apps in Toss SDK와 AIT build
- Toss IAP·광고
- 구매 주문·이용권·차감 테이블과 API
