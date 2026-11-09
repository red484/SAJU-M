# 스토어 자동 배포 (Google Play · App Store)

`main` 브랜치에 네이티브 앱 코드가 푸시되면 이 Mac에서 Android AAB와 iOS IPA를 빌드합니다. 현재 기본값은 **스토어 업로드 없음**입니다. 업로드는 수동 실행의 `upload=true` 또는 저장소 변수 `MOBILE_AUTO_UPLOAD=true`로 별도 활성화합니다. 로컬 검증은 `make release UPLOAD=no`로 실행합니다.

## 한눈에 보기

```
git push (main)
  └─ GitHub Actions: .github/workflows/mobile.yml
       └─ self-hosted 러너 (팀 Mac)
            └─ python3 scripts/store-release.py release all --no-upload
                 ├─ 웹 빌드 (오프라인 대체 화면) → cap sync
                 ├─ Android: gradlew bundleRelease (업로드 키 서명) → AAB (업로드 활성화 시 Play internal 트랙)
                 └─ iOS: xcodebuild archive → exportArchive → IPA (업로드 활성화 시 TestFlight)
```

- **업로드를 활성화했을 때 올라가는 곳:**
  - Google Play: 기본적으로 **내부 테스트(internal) 트랙**에 올라갑니다.
  - App Store Connect: **TestFlight**까지만 올라갑니다.
- **사람이 할 일:** 실제 출시는 직접 합니다. Play에서는 트랙을 승격하고, App Store에서는 심사를 제출합니다.
- Android와 iOS는 각각 실패를 처리합니다. 한 플랫폼의 서명·빌드·업로드가 실패해도 다른 플랫폼은 진행하고, 마지막에 실패한 앱/플랫폼을 알려 주며 종료 코드 1로 끝납니다. 공통 웹 빌드가 실패하면 해당 앱의 두 플랫폼 모두 중단합니다. 지금 앱은 `saju` 하나입니다.
  - Android는 달빛 사주, iOS는 같은 앱이 달빛 노트로 동작합니다([IOS-NOTE-APP.md](IOS-NOTE-APP.md)).
- 웹 서비스 배포(`.github/workflows/deploy.yml`, Lightsail)와는 별개입니다. 같은 푸시로 둘 다 돌 수 있습니다.

## 언제 실행되나

스토어 앱은 운영 웹(`https://saju.ashwoodfriends.com`, `capacitor.config.json`의 `server.url`)을 띄웁니다. 그래서 화면과 기능 변경(`src/**` 등)은 웹 배포만으로 앱에 반영되고, 새 스토어 빌드는 네이티브 껍데기가 바뀔 때만 만듭니다.

| 방법 | 조건 |
|---|---|
| 자동 | `main` 푸시 중 `capacitor.config.json`, `package*.json`, `android/**`, `ios/**`, `native/**`, `resources/**`, `assets/ongi.svg`, 아이콘·릴리즈 스크립트, 릴리즈 테스트, `.github/workflows/mobile.yml` 중 하나라도 바뀐 경우 |
| 수동 (GitHub) | Actions → **mobile** → *Run workflow*. 아래 표의 입력값을 고를 수 있음 |
| 로컬 | 팀 Mac에서 `make release` 계열 명령 실행 |

수동 실행 입력값:

| 입력 | 값 | 기본값 |
|---|---|---|
| `apps` | `all` · `saju` | `all` |
| `only` | `both` · `android` · `ios` | `both` |
| `track` | `internal` · `alpha` · `beta` · `production` | `internal` |
| `runner` | `self-hosted` · `github` | `self-hosted` |
| `upload` | `false` · `true` | `false` (수동 실행은 기본적으로 빌드만) |

`main` 자동 실행은 저장소 변수 `MOBILE_AUTO_UPLOAD`가 정확히 `true`일 때만 업로드합니다. 현재는 변수를 설정하지 않고 빌드만 검증합니다. 수동 실행은 이 변수와 별개로 `upload` 입력을 따릅니다. 업로드 없이 검증하려면 `upload=false`를 유지하세요. 성공한 AAB·IPA는 Actions 아티팩트에 14일간 보관합니다. 모든 러너는 Node.js 24를 사용합니다.

릴리스는 한 번에 하나씩만 실행되고, 앞선 실행을 취소하지 않습니다(`concurrency: mobile-release`). 자동 실행의 Play 트랙은 저장소 변수 `PLAY_TRACK`으로 바꿀 수 있습니다. 변수가 없으면 `internal`입니다.

## 로컬 명령

```bash
make release                      # Android + iOS
make release-saju                 # 앱 지정 (지금은 make release와 같음)
make release ONLY=android         # Android만
make release TRACK=beta           # Play 트랙 지정
make release UPLOAD=no            # 빌드만 하고 올리지 않음 (AAB/IPA 확인용)
```

- 결과물 위치:
  - AAB: `android/app/build/outputs/bundle/release/app-release.aab`
  - `UPLOAD=no`일 때 IPA: `ios/build-export/<빌드번호>/`
  - iOS 아카이브: `ios/build-export/archives/saju-<빌드번호>.xcarchive` (IPA 내보내기가 실패해도 유지)
- 직접 실행할 때: `python3 scripts/store-release.py release <saju|all> [--only android|ios] [--track …] [--no-upload]`

## 버전 규칙

- **빌드 번호:** 2025-01-01 UTC 이후 지난 분(分) 수입니다. 예: `960893`.
  - Android `versionCode`와 iOS `CFBundleVersion`에 같은 값이 들어갑니다.
  - 실행마다 번호가 커지므로 손으로 올릴 필요가 없습니다.
  - 같은 1분 안에 다시 올리면 번호가 겹쳐 스토어가 거부합니다. 1분 뒤에 다시 실행하세요.
- **표시 버전:** 자동으로 바뀌지 않습니다.
  - Android: 실행할 때 `-PversionName`을 넘기지 않으면 `1.0.2`입니다(`android/app/build.gradle`).
  - iOS: Xcode 프로젝트의 `MARKETING_VERSION`을 따릅니다.
  - 새 버전으로 출시하려면 이 값을 올려 커밋합니다. 심사 중이거나 출시된 버전과 같은 표시 버전으로는 App Store에 새 심사를 낼 수 없습니다.

## 키와 계정

키 파일은 모두 팀 Mac의 `~/.saju/`(권한 700)에 있고, **저장소에는 절대 커밋하지 않습니다**. 다른 위치를 쓰려면 환경 변수 `SAJU_SECRETS`로 지정합니다.

| 파일 | 용도 | 만드는 법 |
|---|---|---|
| `saju-keystore.jks`, `saju-signing.json` | Android 업로드 키와 비밀번호 | `make release-setup-saju KEYSTORE=<jks 경로>` |
| `play-service-account.json` | Google Play 업로드 권한이 있는 서비스 계정 키 | 아래 「Google Play 서비스 계정」 |
| `app-store-connect.json`, `AuthKey_<id>.p8` | (선택) App Store Connect API 키 | 없으면 Mac의 Xcode에 로그인된 Apple 계정을 씀 |

### Android 업로드 키

- 2026-11-09 첫 AAB 업로드 전이라는 확인에 따라 이 Mac에서 새 업로드 키를 생성했습니다. SHA-1: `21:E5:52:71:C2:E7:8A:8C:07:46:CC:81:79:71:46:8E:C6:F3:ED:53`. 아직 Play Console에 업로드하거나 키를 등록한 것은 아닙니다.
- 키: `~/.saju/saju-keystore.jks`, 비밀번호·별칭: `~/.saju/saju-signing.json` (파일 권한 600). 공개 인증서는 `~/.saju/saju-upload-certificate.pem`입니다. 이 폴더는 저장소 밖에 있으며 별도로 안전하게 백업해야 합니다.
- 등록: `make release-setup-saju KEYSTORE=<jks 경로> [ALIAS=<별칭>]`
  - 키 별칭 기본값은 `upload`입니다.
  - `release-setup`은 비밀번호를 물은 뒤 별칭과 비밀번호가 맞는지 확인하고, 맞을 때만 키를 등록합니다.
- 릴리스 빌드는 키 지문이 위 값과 다르면 멈춥니다(`scripts/android-release-signing.gradle`). 서명 없이 AAB를 만드는 경로도 없습니다. 이전 문서의 `51:54:…` 지문은 이번 최초 등록용 키의 지문으로 대체했습니다.
- 키 원본은 팀 비밀번호 관리자 같은 안전한 곳에도 따로 보관하세요.
- 키를 잃어버렸다면 Play Console → 앱 서명 →「재설정 요청」으로 새 업로드 키를 등록합니다. 승인되기까지 며칠 걸리고, 새 키의 SHA-1로 위 값과 gradle 파일을 바꿔야 합니다.

### Google Play 서비스 계정

- 계정: `focusbloom-play-release@saju-508804.iam.gserviceaccount.com` (Focus Bloom·아이돌코인과 같은 계정)
- Play Console 권한: 사용자 및 권한 → 이 계정 → 앱 권한에 「달빛 사주」를 추가하고 「프로덕션으로 출시」와 「테스트 트랙으로 출시」를 줍니다.
- 키 파일: 같은 키를 `~/.saju/play-service-account.json`에도 둡니다(`chmod 600`). 키를 새로 받으면 `~/.focusbloom`, `~/.idolcoin`과 함께 모두 바꿉니다.

### Apple

- 팀 ID는 `LRLSLC2RMQ`, 번들 ID는 `com.ashwoodfriends.dalbitsaju`입니다.
- 서명은 자동 방식(`signingStyle automatic`, `-allowProvisioningUpdates`)입니다.
  - 팀 Mac의 Xcode → Settings → Accounts에 이 팀의 Apple 계정이 로그인돼 있어야 합니다.
- 계정 소유자가 Apple Developer 계정의 최신 Program License Agreement와 App Store Connect Business 메뉴의 계약에 동의해 두지 않으면 서명이나 업로드가 막힙니다. Apple이 계약을 갱신하면 다시 동의해야 합니다.

## self-hosted 러너 (팀 Mac)

워크플로는 전용 `saju-mac` 라벨의 러너에서 돕니다. 등록 시 `--no-default-labels`를 사용해 기존 `self-hosted, macOS` 작업(업로드가 켜진 과거 실행)이 이 Mac을 잡지 않도록 합니다. 변경된 워크플로가 GitHub에 반영되어야 새 라벨로 실행됩니다.

- 설치 위치: `~/actions-runner-saju`
  - 다른 프로젝트 러너와 디렉터리를 공유하지 않습니다.
- 2026-11-09 이 Mac에 `saju-mac` 러너를 등록하고 로그인 시 실행되는 서비스를 시작했습니다.
- 새로 등록할 때는 저장소 소유자/관리자 권한으로 등록 토큰을 발급해야 합니다.
- 처음 등록할 때:
  ```bash
  cd ~/actions-runner-saju
  ./config.sh --url https://github.com/red484/SAJU-M --no-default-labels --labels saju-mac --name saju-mac
  # 토큰 입력 프롬프트에 Settings → Actions → Runners → New runner 화면의 토큰 입력
  ./svc.sh install && ./svc.sh start   # 로그인 시 자동 실행
  ```
- 러너의 PATH는 등록할 때의 셸 환경이 `~/actions-runner-saju/.path`에 저장된 것입니다. Node나 JDK를 바꿨다면 `./env.sh` 후 `./svc.sh stop && ./svc.sh start`로 다시 읽힙니다.
- 상태 확인: `./svc.sh status`. GitHub의 Settings → Actions → Runners에서 **Idle**로 보이면 정상입니다.
- **Mac이 꺼져 있으면** 자동 실행이 러너를 기다리며 대기 상태로 남습니다. 급하면 수동 실행에서 `runner = github`을 고릅니다. 이 경우 GitHub가 제공하는 Mac에서 저장소 Secrets의 키로 빌드합니다.
- iOS 빌드를 하려면 러너가 Mac 로그인 세션에서 돌아야 합니다. 서명에 키체인을 쓰기 때문입니다. `svc.sh`로 설치한 LaunchAgent가 이 조건을 만족합니다.
- 저장소 Secret `MAC_KEYCHAIN_PASSWORD`가 설정되어 있으면 iOS 빌드 전에 로그인 키체인을 잠금 해제합니다. 설정하지 않으면 현재 잠금 상태를 그대로 사용합니다. 아래 키 접근 권한 설정과 키체인 잠금 해제는 서로 다른 단계입니다.
- 러너는 백그라운드라 키체인의 "codesign이 키에 접근하려고 합니다" 확인 창을 띄울 수 없습니다. 처음 한 번은 터미널에서 아래를 실행해 codesign이 확인 창 없이 서명 키를 쓰도록 허용합니다. Mac 로그인 비밀번호를 물어봅니다. 서명 인증서를 새로 받으면 다시 실행합니다.
  ```bash
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s ~/Library/Keychains/login.keychain-db
  ```

### GitHub 호스팅 Mac용 Secrets (`runner = github`일 때만)

| Secret | 내용 |
|---|---|
| `ANDROID_SAJU_KEYSTORE_BASE64` | `base64 -i ~/.saju/saju-keystore.jks` |
| `ANDROID_SAJU_SIGNING_JSON` | `~/.saju/saju-signing.json` 내용 |
| `PLAY_SERVICE_ACCOUNT_JSON` | `~/.saju/play-service-account.json` 내용 |
| `APP_STORE_CONNECT_KEY_ID` · `APP_STORE_CONNECT_ISSUER_ID` · `APP_STORE_CONNECT_KEY` | App Store Connect API 키(앱 관리자 역할)와 `.p8` 내용 |

GitHub 호스팅 Mac에는 로그인된 Apple 계정이 없어서 App Store Connect API 키가 꼭 필요합니다. 조직에 API 접근이 켜져 있지 않다면 App Store Connect → 사용자 및 액세스 → 통합 →「액세스 요청」을 먼저 합니다.

GitHub 호스팅 Mac의 키 준비 단계는 선택한 플랫폼에 필요한 Secret만 검사합니다. Android 빌드만 할 때는 Play 서비스 계정 키가 필요 없고, Android만 선택했으면 Apple 키도 필요 없습니다. iOS IPA 내보내기에는 업로드를 끄더라도 Apple 서명 권한이 필요합니다. 로컬 빌드 성공이 원격 러너 등록이나 저장소 Secrets 등록을 의미하지는 않습니다.

릴리즈 제어 회귀 테스트: `python3 -B -m unittest discover -s tests -p test_store_release.py`. 업로드 차단, 플랫폼별 실패 처리, 웹 빌드 실패 시 이전 결과물 사용 방지, iOS 로컬 내보내기와 아카이브 보존을 확인합니다.

## 출시까지 남은 수동 단계

1. **Google Play:** 내부 테스트로 확인한 뒤, Play Console → 테스트 및 출시에서 해당 빌드를 프로덕션으로 승격합니다. 처음부터 `TRACK=production`으로 올려도 됩니다.
2. **App Store:** TestFlight 처리가 끝나면(보통 10~30분) App Store Connect에서 버전을 만들고 빌드를 고른 뒤 심사를 제출합니다.

## 문제 해결

| 증상 | 원인과 조치 |
|---|---|
| `업로드 키가 없어요. 먼저 make release-setup-saju…` | `~/.saju`에 키가 없음 → `make release-setup-saju KEYSTORE=…` 실행 |
| `Release key does not match the upload key registered in Play Console` | 다른 키를 등록함 → 위의 SHA-1과 같은 키로 다시 등록 |
| Play 업로드 `403` / `The caller does not have permission` | 서비스 계정에 앱 권한이 없거나 권한이 아직 반영되지 않음 → Play Console 사용자 및 권한 확인. 권한을 준 직후라면 몇 분 기다림 |
| Play 업로드 `APK specifies a version code that has already been used` | 같은 1분 안에 다시 실행함 → 1분 뒤 다시 실행 |
| `xcodebuild` 서명·프로비저닝 오류 (`No Account for Team`, `PLA Update available`) | Xcode에 팀 계정 로그인이 풀렸거나 계약에 동의하지 않음 → Xcode Accounts와 Apple Developer·App Store Connect 계약 확인 |
| 러너에서만 `codesign` … `errSecInternalComponent` (로컬 `make release`는 성공) | 백그라운드 러너가 키체인 확인 창을 띄우지 못함 → 위 「self-hosted 러너」의 `security set-key-partition-list …`를 한 번 실행 |
| 워크플로가 `Waiting for a runner` 상태로 멈춤 | 팀 Mac이 꺼졌거나 러너 서비스가 멈춤 → `./svc.sh start`, 또는 `runner = github`으로 수동 실행 |

## 관련 파일

- [scripts/store-release.py](../scripts/store-release.py): 빌드와 업로드 전체
- [.github/workflows/mobile.yml](../.github/workflows/mobile.yml): 자동·수동 실행
- [Makefile](../Makefile): `release*`, `release-setup-saju` 명령
- [scripts/android-release-signing.gradle](../scripts/android-release-signing.gradle): 서명 누락 방지와 업로드 키 지문 검사
- [STORE-RELEASE.md](STORE-RELEASE.md): 스토어 등록 정보와 소개·심사 문구
