.DEFAULT_GOAL := help

# Store release options (docs/store.md): make release ONLY=android TRACK=beta UPLOAD=no
RELEASE_FLAGS = $(if $(ONLY),--only $(ONLY)) $(if $(TRACK),--track $(TRACK)) $(if $(filter no,$(UPLOAD)),--no-upload)

.PHONY: help release release-saju release-setup-saju

help: ## 명령어 목록 (make만 입력해도 표시)
	@awk 'BEGIN { FS = ":.*## "; print "달빛 사주 명령어\n" } /^[a-zA-Z0-9_-]+:.*## / { printf "  make %-20s %s\n", $$1, $$2 }' Makefile
	@printf '\n스토어 출시 옵션: ONLY=android|ios TRACK=internal|alpha|beta|production UPLOAD=no (docs/store.md)\n'

release: ## 빌드 → Google Play·App Store Connect 업로드 (push to main 때 러너가 실행하는 것과 같은 명령)
	python3 scripts/store-release.py release all $(RELEASE_FLAGS)

release-saju: release-%: ## 특정 앱만 빌드 → 스토어 업로드
	python3 scripts/store-release.py release $* $(RELEASE_FLAGS)

release-setup-saju: release-setup-%: ## 업로드 키를 ~/.saju에 등록 (KEYSTORE=<jks 경로> [ALIAS=upload])
	@test -n "$(KEYSTORE)" || { printf '%s\n' 'KEYSTORE=<키스토어 .jks 경로>를 지정하세요' >&2; exit 1; }
	python3 scripts/store-release.py setup $* "$(KEYSTORE)" --alias "$(or $(ALIAS),upload)"
