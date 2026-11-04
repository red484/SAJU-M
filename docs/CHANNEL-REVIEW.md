# 채널 정책 점검

확인일: 2026년 11월 4일. 공식 문서와 저장소의 구현을 대조한 결과이며 스토어·토스 심사 통과나 콘솔 설정 완료를 뜻하지 않는다.

| 채널·항목 | 현재 구현과 이번 조치 | 남은 범위 |
| --- | --- | --- |
| iOS 필수 사유 API | 기록 내보내기·공유에 `@capacitor/filesystem`을 사용한다. 플러그인의 공식 지침에 따라 `NSPrivacyAccessedAPICategoryFileTimestamp`의 `C617.1` 사유를 앱의 `PrivacyInfo.xcprivacy`에 추가하고 Xcode Resources에 포함했다. 앱 컨테이너의 내보내기 파일 처리를 위한 사용이다. | SDK 변경 시 사용하는 필수 사유 API를 다시 확인한다. 이 파일은 개인정보 수집 항목 전체에 대한 선언이나 App Store Connect 개인정보 라벨을 대신하지 않는다. |
| iOS 계정 삭제 | 설정에서 계정과 보관함을 직접 삭제한다. 익명 이용자는 해당 보관함 전체를 삭제한다. | **Apple 로그인 토큰 철회 미구현·서버 알림 외부 등록 필요.** 현재 OAuth 응답의 Apple 토큰은 보관하지 않으며 `/auth/revoke`를 호출하지 않는다. 앱 계정 삭제만으로 Apple 로그인 권한 철회까지 끝났다고 안내하면 안 된다. 새 토큰의 안전한 보관·기존 이용자의 재인증·철회 실패 재처리, 서버 알림 수신·서명 검증과 기존 세션 해제는 아래 절차로 구현했으며, Apple 기본 App ID 그룹의 URL 등록과 실제 전송 검증은 필요하다. |
| Google Play 삭제 웹 링크 | `/account-deletion/`에서 직접 삭제할 `/settings` 링크와 로그인 불가 시 삭제 요청 이메일을 제공한다. 익명 보관함은 다른 기기에 자동 연결되지 않음을 명시하고 실제 주문 보관 상태를 안내한다. 자동 운영 검사에 삭제·고객지원 페이지와 설정 경로도 포함했다. | Play Console의 삭제 URL·데이터 보안 양식이 이 주소와 실제 수집·보존 방식에 맞는지 운영자가 확인한다. 실제 스토어 등록 상태는 이번에 변경하지 않았다. |
| Android 디지털 결제 | 독립 Android 앱에서는 웹 요금 미리보기를 설치하지 않으며 Play Billing·웹 PG 결제창이 없다. | 유료 판매를 추가하기 전에 배포 국가·프로그램에 적용되는 Google Play 결제 규칙과 예외 자격을 확인하고 적합한 결제 경로를 구현한다. 웹 PG 승인이나 토스 IAP 연동만으로 충족됐다고 판단하지 않는다. |
| iOS 상품 범위 | 달빛 노트 모드에서 선택 기록·회고를 제공하고 출생 정보·AI 상담·결제 기능은 제공하지 않는다. | 스크린샷·설명·개인정보 라벨을 이 실제 iOS 기능과 맞추고 App Store 심사를 받는다. 일반 정책 링크나 웹 서비스 접근까지 iOS 앱의 전체 유료 판매 승인으로 간주하지 않는다. |
| 토스 디지털 상품 | 토스 IAP 상품 조회·구매·서버 지급·미지급 복원과 환불 상태 확인 경로를 사용한다. 고정 웹 가격을 토스 결제 금액으로 표시하지 않는다. | 콘솔의 상품명·실제 판매 금액·사업자·정산 정보 확인, 최신 `.ait`의 실제 결제·지급·환불·복원 검증이 남았다. |

## 검증 범위

- 웹 전체 자동 테스트와 빌드, 로컬 삭제·고객지원·설정 경로의 HTTP 검사.
- iOS Capacitor 동기화 후 Xcode 시뮬레이터용 서명 없는 빌드. 생성된 `App.app/PrivacyInfo.xcprivacy`의 필수 사유와 Xcode Resources 포함을 확인한다.
- 운영 웹 배포 후 동일 정책 원본·삭제 경로와 전체 상태 검사를 확인한다.
- App Store 서명·아카이브 업로드·심사, Play Console 등록정보, 토스 콘솔·실제 결제 검증은 포함하지 않는다. 웹 자동 배포로 이미 설치된 iOS 앱의 네이티브 선언 파일이 바뀌지는 않으므로 새 앱 빌드 제출이 필요하다.

## 공식 자료

- [Capacitor v8 Filesystem 개인정보 선언 지침](https://capacitorjs.com/docs/apis/filesystem#apple-privacy-manifest-requirements)
- [Apple 필수 사유 API 설명](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple 계정 삭제 및 Apple 로그인 철회 안내](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)
- [Google Play 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=ko)
- [Google Play 결제 정책](https://support.google.com/googleplay/android-developer/answer/9858738?hl=ko)
- [앱인토스 인앱 결제](https://developers-apps-in-toss.toss.im/guide/monetization/in-app-payment.md)

## Apple 권한 변경 알림 수신 구현

`POST https://saju.ashwoodfriends.com/api/auth/apple/notifications`에 Apple의 JSON `{ "payload": "서명된 JWT" }` 형식으로 수신한다. 브라우저 로그인·CSRF 토큰 대신 Apple 공개키의 RS256 서명, Apple 발급자와 명시적으로 허용한 앱 대상, 필수 `iat`·`jti`·이벤트 구조·시각을 검증한다. 임의 JWT의 키 URL은 신뢰하지 않는다.

- 수신 대상은 기본 `APPLE_CLIENT_ID`이다. 앱 그룹의 실제 알림 audience가 다르면 운영 환경에 `APPLE_NOTIFICATION_AUDIENCES`를 쉼표로 구분해 명시한다. 실제 Apple 앱 그룹 값을 확인한 뒤 설정하며 토큰의 audience를 보고 자동 허용하지 않는다.
- `consent-revoked`, `account-deleted`(이전 명칭 `account-delete` 포함)는 해당 Apple 식별자에 연결된 계정의 이벤트 시각 이전 인증 세션만 해제한다. 토큰 원문·주체 식별자·메일·알림 개별 원본은 새 DB 테이블이나 로그에 저장하지 않는다.
- 반복·지연 알림도 이벤트 시각 이후에 생성된 인증 세션은 삭제하지 않는다. 서명이 유효하더라도 미래 이벤트 시각은 적용하지 않는다. 알 수 없는 이벤트·이메일 전달 상태 이벤트는 인증을 변경하지 않고 성공 응답한다. 현재 서비스에는 Apple 이메일 전달 설정을 사용하는 발송 기능이 없다.
- Apple 계정 변경을 서비스 보관함 파기 요청으로 자동 간주하지 않는다. 기존 앱 계정과 상담·선택 기록은 유지하며 서비스 탈퇴는 설정의 회원 탈퇴로 처리한다. 미등록 식별자의 알림도 동일하게 성공 응답해 계정 존재 여부나 삭제 건수를 노출하지 않는다.
- 요청은 IP당 분당 120회·본문 32KB·본문 읽기 5초로 제한한다. 키 조회·DB의 일시 오류는 503으로 응답하며 성공으로 숨기지 않는다. 트래픽 증가 시 Apple 전송량과 제한값을 함께 점검한다.

**외부 설정·후속 구현:** Apple Developer의 기본 App ID 그룹에 위 URL을 등록하고 실제 알림을 전송받아 audience·시각·재전송 동작을 확인해야 한다. 이 설정을 이번 배포에서 대신 수행하지 않았다. 서비스 탈퇴 시 Apple `/auth/revoke` 호출, 토큰의 안전한 보관·기존 이용자 재인증·실패 재처리는 별개로 남는다. 수신 경로가 있다고 토큰 철회까지 완료됐다고 보지 않는다.

근거: [Apple 계정 변경 알림 처리](https://developer.apple.com/documentation/signinwithapple/processing-changes-for-sign-in-with-apple-accounts), [Apple 서버 알림 등록](https://developer.apple.com/help/account/capabilities/enabling-server-to-server-notifications). 로컬 시험 키로 서명·다른 앱/발급자·위조·형식·시각·오류를 테스트하고 PGlite로 반복 수신·다른 계정·재로그인·기록 보존을 검증한다. 실제 Apple 전송을 검증한 것은 아니다.
