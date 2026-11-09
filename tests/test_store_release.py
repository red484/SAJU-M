import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('store_release', Path(__file__).resolve().parents[1] / 'scripts/store-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseControls(unittest.TestCase):
    def test_explicit_upload_still_uses_requested_track(self):
        with patch.object(release, 'build_web'), \
             patch.object(release, 'build_number', return_value=123), \
             patch.object(release, 'android_bundle', return_value=Path('app.aab')), \
             patch.object(release, 'play_upload') as upload:
            release.release(['saju'], 'android', 'internal', True)
            upload.assert_called_once_with('saju', Path('app.aab'), 123, 'internal')

    def test_no_upload_builds_both_without_calling_play(self):
        with patch.object(release, 'build_web') as web, \
             patch.object(release, 'build_number', return_value=123), \
             patch.object(release, 'android_bundle', return_value=Path('app.aab')) as android, \
             patch.object(release, 'play_upload') as upload, \
             patch.object(release, 'ios_release') as ios, \
             patch.object(release.sys, 'platform', 'darwin'):
            release.release(['saju'], None, 'internal', False)
            web.assert_called_once_with(['android', 'ios'])
            android.assert_called_once_with('saju', 123)
            upload.assert_not_called()
            ios.assert_called_once_with('saju', 123, False)

    def test_android_failure_does_not_skip_ios(self):
        with patch.object(release, 'build_web'), \
             patch.object(release, 'android_bundle', side_effect=release.ReleaseError('missing key')), \
             patch.object(release, 'play_upload') as upload, \
             patch.object(release, 'ios_release') as ios, \
             patch.object(release.sys, 'platform', 'darwin'):
            with self.assertRaisesRegex(release.ReleaseError, 'saju/android'):
                release.release(['saju'], None, 'internal', False)
            ios.assert_called_once()
            self.assertFalse(ios.call_args.args[2])
            upload.assert_not_called()

    def test_both_failures_are_reported(self):
        with patch.object(release, 'build_web'), \
             patch.object(release, 'android_bundle', side_effect=release.ReleaseError('android failed')), \
             patch.object(release, 'ios_release', side_effect=release.ReleaseError('ios failed')), \
             patch.object(release.sys, 'platform', 'darwin'):
            with self.assertRaisesRegex(release.ReleaseError, 'saju/android, saju/ios'):
                release.release(['saju'], None, 'internal', False)

    def test_web_failure_does_not_publish_stale_binaries(self):
        with patch.object(release, 'build_web', side_effect=release.ReleaseError('web failed')), \
             patch.object(release, 'android_bundle') as android, \
             patch.object(release, 'play_upload') as upload, \
             patch.object(release, 'ios_release') as ios, \
             patch.object(release.sys, 'platform', 'darwin'):
            with self.assertRaisesRegex(release.ReleaseError, 'saju/web'):
                release.release(['saju'], None, 'internal', True)
            android.assert_not_called()
            upload.assert_not_called()
            ios.assert_not_called()

    def test_no_upload_exports_ipa_locally_and_keeps_archive_on_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            commands = []

            def xcode(cmd, cwd):
                commands.append(cmd)
                archive = Path(cmd[cmd.index('-archivePath') + 1])
                if '-exportArchive' not in cmd:
                    archive.mkdir()
                else:
                    options = plistlib.loads(Path(cmd[cmd.index('-exportOptionsPlist') + 1]).read_bytes())
                    self.assertEqual(options['destination'], 'export')
                    self.assertEqual(options['method'], 'app-store-connect')
                    self.assertFalse(options['manageAppVersionAndBuildNumber'])
                    self.assertEqual(cmd[cmd.index('-exportPath') + 1], root / 'ios/build-export/123')
                    raise release.ReleaseError('export failed')

            with patch.object(release, 'ROOT', root), patch.object(release, '_apple_auth', return_value=[]), patch.object(release, 'run', side_effect=xcode):
                with self.assertRaisesRegex(release.ReleaseError, 'export failed'):
                    release.ios_release('saju', 123, False)
            self.assertEqual(len(commands), 2)
            self.assertTrue((root / 'ios/build-export/archives/saju-123.xcarchive').is_dir())


if __name__ == '__main__':
    unittest.main()
