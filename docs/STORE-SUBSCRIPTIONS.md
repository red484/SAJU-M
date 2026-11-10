# Android·iOS 월 구독

코드는 준비되어 있고 `STORE_IAP_ENABLED=false`가 기본값이다. 스토어 등록과 실기기 샌드박스 확인 전에는 켜지 않는다.

## 상품

| 상품 ID | 가격 | 제공 |
|---|---|---|
| `ongi_plus_monthly` | 월 4,900원 | 결제 기간마다 AI 답변 50회, 이월 없음 |

정의는 `src/shared/store-products.mjs` 한 곳에 있다. 토스는 기존 50회·30일 이용권을 유지한다. 웹은 미리보기만 제공한다(페이플이 사주·운세를 가입 불가 업종으로 안내).

## Google Play Console

1. 위 ID로 구독 상품을 만들고 기본 요금제 ID를 `monthly`로 만든다. 이전 무제한 상품 정의는 기존 거래 복원 호환성을 위해 남겨두지만 신규 판매에는 노출하지 않는다.
2. 서비스 계정을 만들어 Play Console에서 재무 데이터 보기·주문 및 구독 관리 권한을 준다.
3. 서비스 계정 JSON을 운영 환경 변수 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`에 넣는다.
4. 다른 상품으로 바꾸려면 현재 구독을 먼저 해지해야 한다. 플러그인이 교체 결제를 지원하지 않아 앱에서 중복 구매를 막는다.

Google 실시간 알림은 연결하지 않았다. 서버가 최대 6시간마다 구독 상태를 다시 조회하므로 환불이 늦게 반영될 수 있다.

## App Store Connect

1. 삶의 온기 새 앱 `com.ashwoodfriends.ongi`의 `Ongi Plus` 구독 그룹에 위 ID로 자동 갱신 구독을 만든다. 기존 앱의 구독이 새 앱으로 자동 이전되지는 않는다.
2. App Store Server Notifications V2의 운영·샌드박스 URL을 `https://saju.ashwoodfriends.com/api/store-billing/apple/notifications`로 지정한다.
3. App Privacy에 사용자 콘텐츠의 AI 전송을 추가하고 심사 노트에 AI 대화와 구독, 샌드박스 계정을 적는다.

샌드박스 거래도 서버가 받는다. App Review가 운영 빌드에서 샌드박스로 결제하기 때문이다.

## iOS 심사 주의

- 기존 앱은 가이드라인 4.3(b)로 거절된 이력이 있다. 새 삶의 온기 iOS 앱은 사용자 요청에 따라 Android와 같은 사주·상담 기능을 제공하며 실제 기능을 모두 명시해 심사받는다. 같은 사유로 거절될 수 있다.
- 앱은 `saju.ashwoodfriends.com`을 불러온다. 새 iOS 빌드만 전체 서비스 화면을 표시하며, 이전 노트 전용 빌드는 기존 모드를 유지한다. 심사에 제출할 빌드와 운영 서버 화면이 일치해야 한다.

## 출시 순서

1. 두 스토어에 상품을 등록한다.
2. `STORE_IAP_ENABLED=true`를 내부 테스트 환경에 적용한다.
3. 실기기에서 구매, 복원, 갱신, 해지, 환불, 계정 전환을 확인한다.
4. 운영에 켜고 새 앱을 제출한다.
5. 약관·환불·개인정보 문구는 법률 검토 후 확정한다.
