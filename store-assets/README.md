> 아이콘과 Google Play 피처 그래픽은 최신 잎 심볼로 갱신했습니다. 기존 스크린샷은 이전 화면의 기록이므로 스토어 제출 시 새 화면을 캡처해 사용하세요.

# 삶의 온기 · 달빛 노트 스토어 업로드 패키지

## Google Play Console

- 앱 아이콘: `google-play/icon-512.png`
- 그래픽 이미지: `google-play/feature-graphic-1024x500.jpg`
- 휴대전화 스크린샷: `google-play/phone/`의 4장 전부
- 7인치 태블릿 스크린샷: `google-play/tablet-7/`의 4장 전부
- 10인치 태블릿 스크린샷: `google-play/tablet-10/`의 4장 전부
- 앱 이름·간단한 설명·자세한 설명: `STORE-LISTING-KO.md`

스크린샷은 파일명 순서대로 올리면 됩니다.

## App Store Connect

- 앱 아이콘: `app-store/icon-1024.png` (앱 번들의 AppIcon에도 동일한 이미지 적용)
- iPhone 6.5형 스크린샷: `app-store/iphone-6.5/`의 4장 전부
- 프로모션 텍스트·설명·키워드·URL: `STORE-LISTING-KO.md`

모든 iPhone 이미지는 App Store Connect가 안내한 1242×2688 규격입니다.

## 원본 재생성

웹 브랜드 심볼 `assets/ongi.svg`가 모든 아이콘의 공통 원본입니다. 다음 명령은 웹 파비콘·홈 화면 아이콘·manifest, iOS 앱 아이콘·시작 화면, Android 런처·적응형·테마·알림 아이콘·시작 화면, 스토어용 아이콘과 피처 그래픽을 함께 갱신합니다.

```bash
npm run native:assets
npm run native:sync
```

`native:sync`는 이미지 재생성, 웹 빌드, 두 네이티브 프로젝트로의 복사를 포함합니다. 앱 이름은 채널별 기존 설정을 유지합니다. 앱인토스 콘솔용 아이콘은 `apps-in-toss/icon-600.png`입니다. 스토어/콘솔 등록 이미지 업로드와 앱 출시·웹 배포는 별도 작업입니다.

아래 명령은 이전 디자인의 마케팅 이미지까지 재생성하므로 아이콘만 바꿀 때는 사용하지 않습니다.

```bash
/Users/ashwoodfriends/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build-store-assets.py
```
