#!/usr/bin/env python3
"""Builds the store app and uploads it: Android to Google Play, iOS to App Store Connect (TestFlight).

    python3 scripts/store-release.py setup saju <keystore.jks> [--alias upload]   keep the upload key in ~/.saju
    python3 scripts/store-release.py release <saju|all> [--only android|ios] [--track internal] [--no-upload]

`make release` and the self-hosted GitHub runner (.github/workflows/mobile.yml) both run `release`, so a push to
main and a hand-run release do exactly the same thing. Everything secret lives outside the repository in
~/.saju (SAJU_SECRETS overrides), because the runner checks the repository out somewhere else:

    <app>-keystore.jks, <app>-signing.json   upload key and its passwords (written by `setup`)
    play-service-account.json                Google Play service account (release rights on the app)
    app-store-connect.json + AuthKey_<id>.p8  optional: {"key_id", "issuer_id"}; without it Xcode signs and uploads
                                              with the Apple account it is signed in to
Build numbers are the minutes since 2025-01-01 (UTC): always higher than the last upload, from any machine.
"""
from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS = Path(os.environ.get('SAJU_SECRETS', Path.home() / '.saju'))
APPS = {'saju': 'com.ashwoodfriends.dalbitsaju'}
TEAM_ID = 'LRLSLC2RMQ'
PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
PLAY_UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'


class ReleaseError(RuntimeError):
    pass


def run(cmd, cwd, env=None):
    print('$ ' + ' '.join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], cwd=cwd, env=env, check=True)


def build_number() -> int:
    return int((datetime.now(timezone.utc) - datetime(2025, 1, 1, tzinfo=timezone.utc)).total_seconds() // 60)


def java_env():
    env = os.environ.copy()
    for home in (env.get('JAVA_HOME'), '/Applications/Android Studio.app/Contents/jbr/Contents/Home'):
        if home and (Path(home) / 'bin/java').is_file():
            env['JAVA_HOME'] = home
            break
    else:
        raise ReleaseError('JDK를 찾지 못했어요. Android Studio를 설치하거나 JAVA_HOME을 지정하세요.')
    sdk = Path.home() / 'Library/Android/sdk'
    if not env.get('ANDROID_HOME') and sdk.is_dir():
        env['ANDROID_HOME'] = str(sdk)
    return env


# ── setup ──

def setup(app: str, keystore: Path, alias: str):
    if not keystore.is_file():
        raise ReleaseError(f'키스토어 파일이 없어요: {keystore}')
    SECRETS.mkdir(mode=0o700, exist_ok=True)
    store_password = getpass.getpass(f'{app} 키스토어 비밀번호: ')
    key_password = getpass.getpass(f'{app} 키 비밀번호 (키스토어와 같으면 Enter): ') or store_password
    env = java_env()
    keytool = Path(env['JAVA_HOME']) / 'bin/keytool'
    env['SJ_STORE'], env['SJ_KEY'] = store_password, key_password
    check = subprocess.run([keytool, '-certreq', '-keystore', keystore, '-alias', alias, '-storepass:env', 'SJ_STORE',
                            '-keypass:env', 'SJ_KEY'], env=env, capture_output=True)
    if check.returncode:
        raise ReleaseError(f'비밀번호나 alias({alias})가 맞지 않아요. 아무것도 저장하지 않았어요.')
    # keytool ignores -keypass for PKCS12, so the check above cannot catch a wrong key password there;
    # a PKCS12 key is always protected by the store password.
    listing = subprocess.run([keytool, '-J-Duser.language=en', '-list', '-keystore', keystore, '-storepass:env', 'SJ_STORE'],
                             env=env, capture_output=True, text=True).stdout
    if 'Keystore type: PKCS12' in listing and key_password != store_password:
        raise ReleaseError('PKCS12 키스토어는 키 비밀번호가 키스토어 비밀번호와 같아요. 키 비밀번호 질문에서 Enter를 누르세요. '
                           '아무것도 저장하지 않았어요.')
    target = SECRETS / f'{app}-keystore.jks'
    shutil.copyfile(keystore, target)
    target.chmod(0o600)
    signing = SECRETS / f'{app}-signing.json'
    signing.write_text(json.dumps({'store_password': store_password, 'key_password': key_password, 'alias': alias}))
    signing.chmod(0o600)
    print(f'{app}: 업로드 키를 {SECRETS}에 저장했어요. 원본 키스토어는 따로 백업해 두세요.')


# ── web ──

def build_web(platforms: list[str]):
    # The store app loads https://saju.ashwoodfriends.com (capacitor.config.json server.url); the bundled
    # dist/client is only the offline fallback, so the build needs no production settings.
    if not (ROOT / 'node_modules').is_dir() or os.environ.get('CI'):
        run(['npm', 'ci', '--no-audit', '--no-fund'], ROOT)
    run(['npm', 'run', 'native:assets'], ROOT)
    run(['npm', 'run', 'build'], ROOT)
    for platform in platforms:
        run([ROOT / 'node_modules/.bin/cap', 'sync', platform], ROOT)


# ── android ──

def android_bundle(app: str, number: int) -> Path:
    signing_file, keystore = SECRETS / f'{app}-signing.json', SECRETS / f'{app}-keystore.jks'
    if not signing_file.is_file() or not keystore.is_file():
        raise ReleaseError(f'{app} 업로드 키가 없어요. 먼저 make release-setup-{app} KEYSTORE=<경로>를 실행하세요.')
    s = json.loads(signing_file.read_text())
    android = ROOT / 'android'
    # injected signing (Android Gradle Plugin): no keystore.properties is written into the checkout. The values go in
    # as ORG_GRADLE_PROJECT_* variables, so no password shows in the printed command or the process list.
    env = java_env()
    for name, value in (('store.file', str(keystore)), ('store.password', s['store_password']),
                        ('key.alias', s['alias']), ('key.password', s['key_password'])):
        env[f'ORG_GRADLE_PROJECT_android.injected.signing.{name}'] = value
    run([android / 'gradlew', '--no-daemon', 'bundleRelease', f'-PversionCode={number}'], android, env)
    aab = android / 'app/build/outputs/bundle/release/app-release.aab'
    if not aab.is_file():
        raise ReleaseError('AAB를 찾지 못했어요: ' + str(aab))
    return aab


def _google_token(account: dict) -> str:
    """OAuth token for a service account (JWT bearer grant), signed with openssl; no Google SDK or pip package."""
    b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b'=')  # noqa: E731
    now = int(time.time())
    header = b64(json.dumps({'alg': 'RS256', 'typ': 'JWT'}).encode())
    claims = b64(json.dumps({'iss': account['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher',
                             'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3600}).encode())
    with tempfile.TemporaryDirectory() as tmp:
        key = Path(tmp) / 'key.pem'
        key.write_text(account['private_key'])
        key.chmod(0o600)
        signature = b64(subprocess.run(['openssl', 'dgst', '-sha256', '-sign', key], input=header + b'.' + claims,
                                       capture_output=True, check=True).stdout)
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                                   'assertion': (header + b'.' + claims + b'.' + signature).decode()}).encode()
    with urllib.request.urlopen('https://oauth2.googleapis.com/token', data=body) as r:
        return json.load(r)['access_token']


def _play(token: str, method: str, url: str, body=None, content_type='application/json'):
    data = body if isinstance(body, bytes) or body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={'Authorization': f'Bearer {token}', 'Content-Type': content_type})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise ReleaseError(f'Google Play {method} {url.split("/applications/")[-1]}: {e.code} {e.read().decode()[:400]}') from e


def play_upload(app: str, aab: Path, number: int, track: str):
    """Publishing API: open an edit, upload the bundle, put it on the track, commit."""
    account_file = SECRETS / 'play-service-account.json'
    if not account_file.is_file():
        raise ReleaseError(f'Google Play 서비스 계정 키가 없어요: {account_file}')
    token = _google_token(json.loads(account_file.read_text()))
    package = APPS[app]

    def publish(status):
        edit = _play(token, 'POST', f'{PLAY_API}/{package}/edits', {})['id']
        _play(token, 'POST', f'{PLAY_UPLOAD}/{package}/edits/{edit}/bundles?uploadType=media', aab.read_bytes(),
              'application/octet-stream')
        _play(token, 'PUT', f'{PLAY_API}/{package}/edits/{edit}/tracks/{track}',
              {'track': track, 'releases': [{'versionCodes': [str(number)], 'status': status}]})
        _play(token, 'POST', f'{PLAY_API}/{package}/edits/{edit}:commit', {})

    try:
        publish('completed')
        print(f'{app}: Google Play {track} 트랙에 {number}번 빌드를 올렸어요.')
    except ReleaseError as e:
        # An app that was never published on Play only accepts draft releases.
        if 'draft app' not in str(e):
            raise
        publish('draft')
        print(f'{app}: 아직 출시 전인 앱이라 {track} 트랙에 {number}번 빌드를 초안으로 올렸어요. Play Console에서 출시하세요.')


# ── ios ──

def _apple_auth() -> list[str]:
    """API key flags when ~/.saju/app-store-connect.json is there; otherwise Xcode's signed-in account."""
    config = SECRETS / 'app-store-connect.json'
    if not config.is_file():
        return []
    c = json.loads(config.read_text())
    key = SECRETS / f"AuthKey_{c['key_id']}.p8"
    if not key.is_file():
        raise ReleaseError(f'App Store Connect 키 파일이 없어요: {key}')
    return ['-authenticationKeyPath', str(key), '-authenticationKeyID', c['key_id'], '-authenticationKeyIssuerID', c['issuer_id']]


def ios_release(app: str, number: int, upload: bool):
    project = ROOT / 'ios/App/App.xcodeproj'
    auth = ['-allowProvisioningUpdates', *_apple_auth()]
    with tempfile.TemporaryDirectory(prefix=f'{app}-ios-') as tmp:
        archive = Path(tmp) / 'App.xcarchive'
        run(['xcodebuild', '-project', project, '-scheme', 'App', '-configuration', 'Release',
             '-destination', 'generic/platform=iOS', '-archivePath', archive, *auth,
             f'CURRENT_PROJECT_VERSION={number}', f'DEVELOPMENT_TEAM={TEAM_ID}', 'archive'], ROOT)
        options = Path(tmp) / 'ExportOptions.plist'
        options.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>{'upload' if upload else 'export'}</string>
  <key>teamID</key><string>{TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
''')
        out = ROOT / 'ios/build-export'
        run(['xcodebuild', '-exportArchive', '-archivePath', archive, '-exportOptionsPlist', options,
             '-exportPath', out, *auth], ROOT)
    print(f'{app}: ' + (f'App Store Connect에 {number}번 빌드를 올렸어요 (TestFlight에서 처리 후 심사 제출).' if upload
                        else f'IPA를 만들었어요: {out}'))


def release(apps: list[str], only: str | None, track: str, upload: bool):
    platforms = [p for p in ('android', 'ios') if only in (None, p)]
    if 'ios' in platforms and sys.platform != 'darwin':
        raise ReleaseError('iOS 빌드는 macOS에서만 할 수 있어요. --only android로 실행하세요.')
    number = build_number()
    print(f'빌드 번호 {number} · {", ".join(apps)} · {", ".join(platforms)}' + ('' if upload else ' · 업로드 안 함'), flush=True)
    failed = []
    for app in apps:
        try:
            build_web(platforms)
            if 'android' in platforms:
                aab = android_bundle(app, number)
                if upload:
                    play_upload(app, aab, number, track)
                else:
                    print(f'{app}: AAB를 만들었어요: {aab}')
            if 'ios' in platforms:
                ios_release(app, number, upload)
        except (ReleaseError, subprocess.CalledProcessError, OSError) as e:
            print(f'오류 ({app}): {e}', file=sys.stderr)
            failed.append(app)  # the other apps still go out
    if failed:
        raise ReleaseError('실패한 앱: ' + ', '.join(failed))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)
    s = sub.add_parser('setup')
    s.add_argument('app', choices=APPS)
    s.add_argument('keystore', type=Path)
    s.add_argument('--alias', default='upload')
    r = sub.add_parser('release')
    r.add_argument('app', choices=[*APPS, 'all'])
    r.add_argument('--only', choices=['android', 'ios'])
    r.add_argument('--track', default=os.environ.get('PLAY_TRACK') or 'internal',
                   choices=['internal', 'alpha', 'beta', 'production'])
    r.add_argument('--no-upload', action='store_true', help='빌드만 하고 스토어에 올리지 않음')
    args = parser.parse_args()
    try:
        if args.command == 'setup':
            setup(args.app, args.keystore.expanduser(), args.alias)
        else:
            release(list(APPS) if args.app == 'all' else [args.app], args.only, args.track, not args.no_upload)
    except (ReleaseError, subprocess.CalledProcessError, OSError) as e:
        print(f'오류: {e}', file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        print('\n취소했어요.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
