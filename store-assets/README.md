# 달빛 사주 스토어 업로드 패키지

## Google Play Console

- 앱 아이콘: `google-play/icon-512.png`
- 그래픽 이미지: `google-play/feature-graphic-1024x500.jpg`
- 휴대전화 스크린샷: `google-play/phone/`의 4장 전부
- 7인치 태블릿 스크린샷: `google-play/tablet-7/`의 4장 전부
- 10인치 태블릿 스크린샷: `google-play/tablet-10/`의 4장 전부
- 앱 이름·간단한 설명·자세한 설명: `STORE-LISTING-KO.md`

스크린샷은 파일명 순서대로 올리면 됩니다.

## App Store Connect

- iPhone 6.5형 스크린샷: `app-store/iphone-6.5/`의 4장 전부
- 프로모션 텍스트·설명·키워드·URL: `STORE-LISTING-KO.md`

모든 iPhone 이미지는 App Store Connect가 안내한 1242×2688 규격입니다.

## 원본 재생성

```bash
/Users/ashwoodfriends/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build-store-assets.py
```
