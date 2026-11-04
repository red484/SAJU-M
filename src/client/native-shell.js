import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { resolveNoteMode, reviewReminders, reminderId } from './app-mode.js';

export const nativeApp = Capacitor.isNativePlatform();
export const noteMode = resolveNoteMode({ platform: Capacitor.getPlatform(), search: location.search, storage: globalThis.sessionStorage });
export const APP_NAME = noteMode ? '달빛 노트' : '삶의 온기';
let started = false;

const reminderKey = id => `ongi-review-reminder:${id}`;
export function reviewReminderEnabled(id) {
  try { return localStorage.getItem(reminderKey(id)) === 'on'; } catch { return false; }
}
export function setReviewReminder(id, enabled) {
  try {
    if (enabled) localStorage.setItem(reminderKey(id), 'on');
    else localStorage.removeItem(reminderKey(id));
  } catch { /* The record can still be saved without a device reminder. */ }
}
export async function reviewReminderStatus(record) {
  if (!reviewReminderEnabled(record.id)) return '이 기기에서 알림 꺼짐';
  try {
    await reminderSync;
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return '기기 설정에서 알림 권한이 필요해요.';
    if (!reviewReminders([record]).length) return '예약할 회고 시간이 없어요.';
    const { notifications } = await LocalNotifications.getPending();
    return notifications.some(notification => notification.id === reminderId(record.id))
      ? '이 기기에 알림이 예약됐어요.' : '이 기기에 알림이 예약되지 않았어요.';
  } catch { return '알림 예약 상태를 확인하지 못했어요.'; }
}

let reminderSync = Promise.resolve();
export function syncReviewReminders(records) {
  if (!nativeApp) return reminderSync;
  const wanted = reviewReminders(noteMode ? records : records.filter(record => reviewReminderEnabled(record.id)));
  reminderSync = reminderSync.then(() => scheduleReviewReminders(wanted));
  return reminderSync;
}

async function scheduleReviewReminders(wanted) {
  try {
    const { notifications: pending } = await LocalNotifications.getPending();
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    if (!wanted.length) return;
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') ({ display } = await LocalNotifications.requestPermissions());
    if (display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: wanted.map(n => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at }, extra: n.extra }))
    });
  } catch {
    // Reminders are a convenience; records are already saved on the server.
  }
}

export async function setupNativeShell({ back, notify, openRecord }) {
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

  await LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const id = notification.extra?.recordId;
    if (id) openRecord?.(id);
  });

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

export async function shareNativeFile(blob, name, title = APP_NAME) {
  if (!nativeApp) return false;
  const saved = await Filesystem.writeFile({
    path: name,
    data: await blobBase64(blob),
    directory: Directory.Cache
  });
  await Share.share({ title, files: [saved.uri], dialogTitle: `${title} 공유·저장` });
  return true;
}
