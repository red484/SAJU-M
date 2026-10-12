#!/bin/sh
# Backend-only release; preserve the live web image and all other services.
set -eu
cd "$(dirname "$0")/.."
test -f .env.production
test "$(docker inspect -f '{{.State.Running}}' saju-backend)" = true
docker exec saju-backend node --input-type=module -e '
import {access} from "node:fs/promises";
if(process.env.TOSS_LOGIN_MOCK === "true") throw Error("Disable mock login before payments");
await access(process.env.TOSS_MTLS_CERT_PATH);
await access(process.env.TOSS_MTLS_KEY_PATH);
console.log("mTLS files present; mock login disabled");'
release_id="$(date -u +%Y%m%d%H%M%S)"
backup="saju-m-backend:before-toss-$release_id"
docker tag "$(docker inspect -f '{{.Image}}' saju-backend)" "$backup"
context_dir="$(mktemp -d /tmp/saju-toss-release.XXXXXX)"
cp -p .env.production "$context_dir/env.production"
cp -R src/server "$context_dir/src-server"
cp -R src/shared "$context_dir/src-shared"
cp -R server "$context_dir/server"
cp src/client/consultation-scope.js "$context_dir/consultation-scope.js"
cp deploy/prebuilt/Backend.Dockerfile "$context_dir/Dockerfile"
DOCKER_BUILDKIT=0 docker build --pull=false --build-arg "BASE=$backup" -t "saju-m-backend:toss-$release_id" "$context_dir"
compose() { docker compose --env-file .env.production -f docker-compose.prd.yml "$@"; }
rollback() {
  cp -p "$context_dir/env.production" .env.production
  docker tag "$backup" saju-m-backend:latest
  compose up -d --no-deps --no-build backend
  docker exec saju-web nginx -t && docker exec saju-web nginx -s reload
  echo "Rollback applied: $backup" >&2
}
# Preserve every other environment variable without printing credentials.
awk '!/^TOSS_IAP_ENABLED=/' .env.production > "$context_dir/env.updated"
printf '\nTOSS_IAP_ENABLED=true\n' >> "$context_dir/env.updated"
chmod 600 "$context_dir/env.updated"
cp "$context_dir/env.updated" .env.production
docker tag "saju-m-backend:toss-$release_id" saju-m-backend:latest
if ! compose up -d --no-deps --no-build backend; then rollback; exit 1; fi
attempt=0
until docker exec saju-backend node -e "fetch('http://127.0.0.1:9090/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
  attempt=$((attempt+1))
  if [ "$attempt" -ge 12 ]; then rollback; exit 1; fi
  sleep 3
done
# nginx resolves the backend container address at configuration load time.
# Refresh only this app's proxy after replacing its backend container.
if ! (docker exec saju-web nginx -t && docker exec saju-web nginx -s reload); then rollback; exit 1; fi
if ! docker exec saju-backend node -e "fetch('http://127.0.0.1:9090/api/toss-billing/product').then(r=>r.json()).then(b=>{console.log(JSON.stringify(b));process.exit(b.enabled===true?0:1)}).catch(()=>process.exit(1))"; then rollback; exit 1; fi
echo "Toss billing deployed: $release_id"
echo "Rollback image: $backup"
echo "Private recovery directory: $context_dir"
