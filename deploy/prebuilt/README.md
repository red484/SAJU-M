# 2026-09-30 account consultation limit release

The checked-in archive contains only locally built public JS/CSS, not environment
files, keys, user data, or native/Toss builds. It overlays the existing web image
and keeps older chunks available for already-open browsers.

This release changes no dependencies. The backend overlay includes the server
source and migration 003_coach_quota, applied by the existing startup migrator.
The new account-owned table records successful AI answers for a lifetime limit
of five and idempotent retries. Existing answers are not backfilled. Account
deletion cascades to these rows. Guest AI requests require login.
Rollback leaves the additive table in place; old code does not use it.
Do not reuse this deployment for future dependency/schema/asset changes without
updating the packaging and verification steps.

From the production checkout run `sh scripts/deploy-prebuilt-web.sh`.
It verifies the archive, tags the running images for rollback, builds two tiny
COPY-only layers sequentially, and recreates only backend/web with --no-deps.
It never installs packages, builds frontend source, starts db-init, changes swap,
or prunes images. A failed readiness check rolls back the two image tags.

Before packaging, run `node --test tests/coach-quota.test.mjs`, `npm test`, and
the normal web build. Package only dist/client JS and CSS into web-code.tar.gz
and update web-code.sha256. Never include environment or certificate files.

For manual rollback, tag the two printed `before-*` images as
`saju-m-web:latest` and `saju-m-backend:latest`, then run:

```sh
docker compose --env-file .env.production -f docker-compose.prd.yml up -d --no-deps --no-build backend web
```
