import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';

export const nativeApp = Capacitor.isNativePlatform();
let started = false;

export async function setupNativeShell({ back, notify }) {
  if (!nativeApp || started) return;
  started = true;
  document.documentElement.classList.add('native-app');

  await App.addListener('backButton', async ({ canGoBack }) => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { dialog.close(); return; }
    if (await back?.()) return;
    if (canGoBack) history.back();
    else await App.exitApp();
  });

  const paintNetwork = status => {
    document.documentElement.classList.toggle('is-offline', !status.connected);
    if (!status.connected) notify?.('인터넷 연결이 끊겼어요. 연결되면 다시 이어집니다.');
  };
  paintNetwork(await Network.getStatus());
  await Network.addListener('networkStatusChange', paintNetwork);

  // 정책 페이지는 앱 안에서 유지하고, 계산 출처 같은 외부 사이트만 시스템
  // 브라우저로 엽니다. 사용자가 앱으로 돌아오면 입력 상태가 그대로 남습니다.
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
    event.preventDefault();
    Browser.open({ url: url.href });
  });
}

const blobBase64 = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error);
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.readAsDataURL(blob);
});

export async function shareNativeFile(blob, name, title = '달빛 사주') {
  if (!nativeApp) return false;
  const saved = await Filesystem.writeFile({
    path: name,
    data: await blobBase64(blob),
    directory: Directory.Cache
  });
  await Share.share({ title, files: [saved.uri], dialogTitle: `${title} 공유·저장` });
  return true;
}
