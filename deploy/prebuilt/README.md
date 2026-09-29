# 2026-09-29 web usability release

The checked-in archive contains only locally built public JS/CSS, not environment
files, keys, user data, or native/Toss builds. It overlays the existing web image
and keeps older chunks available for already-open browsers.

This release changes no dependencies or database schema. The backend overlay
contains only coach-service.mjs and its new consultation-scope.js dependency.
Do not reuse this deployment for future dependency/schema/asset changes without
updating the packaging and verification steps.

From the production checkout run `sh scripts/deploy-prebuilt-web.sh`.
It verifies the archive, tags the running images for rollback, builds two tiny
COPY-only layers sequentially, and recreates only backend/web with --no-deps.
It never installs packages, builds frontend source, starts db-init, changes swap,
or prunes images. A failed readiness check rolls back the two image tags.

For manual rollback, tag the two printed `before-*` images as
`saju-m-web:latest` and `saju-m-backend:latest`, then run:

```sh
docker compose --env-file .env.production -f docker-compose.prd.yml up -d --no-deps --no-build backend web
```
