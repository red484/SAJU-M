#!/bin/sh
# App-scoped update: reuse installed dependencies, no npm install or DB init.
set -eu
cd "$(dirname "$0")/.."
test -f .env.production
sha256sum -c deploy/prebuilt/web-code.sha256
test "$(docker inspect -f '{{.State.Running}}' saju-web)" = true
test "$(docker inspect -f '{{.State.Running}}' saju-backend)" = true
release_id="$(date -u +%Y%m%d%H%M%S)"
web_backup="saju-m-web:before-$release_id"
backend_backup="saju-m-backend:before-$release_id"
docker tag "$(docker inspect -f '{{.Image}}' saju-web)" "$web_backup"
docker tag "$(docker inspect -f '{{.Image}}' saju-backend)" "$backend_backup"
context_dir="$(mktemp -d /tmp/saju-web-release.XXXXXX)"
mkdir -p "$context_dir/web" "$context_dir/backend"
tar -xzf deploy/prebuilt/web-code.tar.gz -C "$context_dir/web"
asset_version="$(cut -c 1-16 deploy/prebuilt/web-code.sha256)"
sed -e "s|/app.js\"|/app.js?v=$asset_version\"|g" -e "s|/app.css\"|/app.css?v=$asset_version\"|g" index.html > "$context_dir/web/index.html"
cp -R src/server "$context_dir/backend/src-server"
cp -R server "$context_dir/backend/server"
cp src/client/consultation-scope.js "$context_dir/backend/"
cp deploy/prebuilt/Web.Dockerfile "$context_dir/web/Dockerfile"
cp deploy/prebuilt/Backend.Dockerfile "$context_dir/backend/Dockerfile"
DOCKER_BUILDKIT=0 docker build --pull=false --build-arg "BASE=$web_backup" -t "saju-m-web:release-$release_id" "$context_dir/web"
DOCKER_BUILDKIT=0 docker build --pull=false --build-arg "BASE=$backend_backup" -t "saju-m-backend:release-$release_id" "$context_dir/backend"
compose() { docker compose --env-file .env.production -f docker-compose.prd.yml "$@"; }
rollback() {
  docker tag "$web_backup" saju-m-web:latest
  docker tag "$backend_backup" saju-m-backend:latest
  compose up -d --no-deps --no-build backend web
  echo "Rolled back to $web_backup and $backend_backup" >&2
}
docker tag "saju-m-web:release-$release_id" saju-m-web:latest
docker tag "saju-m-backend:release-$release_id" saju-m-backend:latest
if ! compose up -d --no-deps --no-build backend web; then rollback; exit 1; fi
attempt=0
until docker exec saju-backend node -e "fetch('http://127.0.0.1:9090/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 12 ]; then rollback; exit 1; fi
  sleep 3
done
if ! curl --fail --max-time 20 https://saju.ashwoodfriends.com/api/ready; then rollback; exit 1; fi
echo "Deployment complete: $release_id"
echo "Rollback images: $web_backup $backend_backup"
echo "Retained staging files: $context_dir"
