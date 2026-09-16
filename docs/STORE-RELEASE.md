# 달빛 사주 스토어 등록·빌드

## 공통 식별 정보

- 앱 이름: 달빛 사주
- 영문 이름: Dalbit Saju
- Bundle ID / Package Name: `com.ashwoodfriends.dalbitsaju`
- 버전: `1.0.0`
- 서비스 URL: `https://saju.ashwoodfriends.com`
- 개인정보 처리방침: `https://saju.ashwoodfriends.com/privacy/`
- 고객지원: `https://saju.ashwoodfriends.com/support/`
- 계정 및 데이터 삭제: `https://saju.ashwoodfriends.com/account-deletion/`
- 문의: `green@ashwoodfriends.com`

## App Store Connect

- 플랫폼: iOS
- 기본 언어: 한국어
- Bundle ID: `com.ashwoodfriends.dalbitsaju`
- SKU 예시: `DALBIT-SAJU-IOS-001`
- 기본 카테고리: 라이프스타일
- 가격: 무료
- 연령 등급: 설문 응답에 따라 결정

Xcode 프로젝트는 `ios/App/App.xcodeproj`이며 Team ID `LRSLC2RMQ`, 자동 서명,
iPhone 전용 세로 화면으로 설정되어 있다. Xcode에서 회사 팀을 확인한 후
Product → Archive → Distribute App → App Store Connect로 업로드한다.

```sh
npm run native:sync
npm run native:ios
```

## Google Play Console

- 앱 또는 게임: 앱
- 기본 언어: 한국어
- 앱 이름: 달빛 사주
- Package Name: `com.ashwoodfriends.dalbitsaju`
- 기본 카테고리: 라이프스타일
- 가격: 무료
- 광고: 없음
- 계정 생성: Google·Apple 소셜 로그인과 비회원 이용 지원

Play Console에는 서명된 AAB가 필요하다. 업로드 키는 저장소 밖에 보관하고
아래 환경 변수로만 전달한다.

```sh
export DALBIT_UPLOAD_STORE_FILE=/절대경로/dalbit-upload.jks
export DALBIT_UPLOAD_STORE_PASSWORD='...'
export DALBIT_UPLOAD_KEY_ALIAS='dalbit-upload'
export DALBIT_UPLOAD_KEY_PASSWORD='...'

cd android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
GRADLE_USER_HOME=../.gradle ./gradlew bundleRelease
```

결과 파일은 `android/app/build/outputs/bundle/release/app-release.aab`이다.
Play App Signing을 활성화하고 먼저 내부 테스트 트랙에 업로드한다.

## 스토어 소개 초안

짧은 소개:

> 사주로 나를 읽고, 오늘의 선택과 상담 기록을 차분히 돌아보세요.

상세 소개:

> 달빛 사주는 전통 명리 계산과 AI 상담을 활용해 나의 성향과 선택을 돌아보는 자기 성찰 서비스입니다. 생년월일과 태어난 시간을 바탕으로 사주 명식과 흐름을 확인하고, 오늘의 해석과 관심 주제별 이야기를 살펴볼 수 있습니다. 고민을 달빛 도령과 정리하고 필요한 답변을 저장하거나 공유해 보세요. 로그인하면 상담과 기록을 계정에 연결할 수 있으며, 로그인 없이도 이용할 수 있습니다. 사주 해석과 AI 답변은 오락·참고 목적이며 의료·법률·투자 등 전문적인 판단을 대신하지 않습니다.

## 심사 메모 초안

> 달빛 사주는 사주 계산, 오늘의 해석, AI 기반 자기 성찰 상담과 상담 기록 저장 기능을 제공합니다. Google 또는 Apple 로그인 외에 ‘로그인 없이 이용하기’를 선택하면 심사자가 즉시 모든 주요 기능을 확인할 수 있습니다. 앱 설정에서 계정 및 데이터 전체 삭제가 가능합니다. 외부 링크는 시스템 브라우저로 열리고, 대화 캡처는 네이티브 공유 시트를 사용합니다. 서비스 결과는 오락·참고 목적이며 전문적인 의료·법률·투자 판단을 대신하지 않는다는 안내를 앱 안에 표시합니다.

## 제출 전 확인

- Google·Apple 로그인을 iPhone과 Android 실기기에서 각각 완료한다.
- 비회원 시작, 온보딩, 새로고침 후 기록 유지, 로그아웃, 재로그인, 회원 탈퇴를 확인한다.
- 개인정보 처리방침·이용약관·삭제 안내의 로그인 관련 문구가 현재 기능과 일치하는지 확인한다.
- App Privacy와 Data safety는 실제 수집·전송 항목에 맞춰 작성한다.
- iPhone 및 Android 휴대전화 스크린샷과 Google Feature Graphic을 만든다.
- Android 업로드 키를 별도 보관하고 Play App Signing을 활성화한다.
