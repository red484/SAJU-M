import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Network } from '@capacitor/network';
import { Share } from '@capacitor/share';
import { resolveNoteMode, reviewReminders, reminderId } from './app-mode.js';
import { getJournal } from './api/journal.js';

export const nativeApp = Capacitor.isNativePlatform();
export const noteMode = resolveNoteMode({ platform: Capacitor.getPlatform(), search: location.search, storage: globalThis.sessionStorage });
export const APP_NAME = '삶의 온기';
let started = false;

const DAILY_KEY = 'ongi-daily-reminder';
const DAILY_ID = 2147480001;
export function dailyReminderEnabled() {
  try { return localStorage.getItem(DAILY_KEY) === 'on'; } catch { return false; }
}
export function setDailyReminder(enabled) {
  try {
    if (enabled) localStorage.setItem(DAILY_KEY, 'on');
    else localStorage.removeItem(DAILY_KEY);
  } catch { /* The screen still works without a device reminder. */ }
}
const dailyReminder = () => noteMode || !dailyReminderEnabled() ? [] : [{ id: DAILY_ID, title: '오늘의 질문이 도착했어요', body: '오늘 한 가지만 짚어 볼까요?', schedule: { on: { hour: 8, minute: 30 } }, extra: { page: 'today' } }];
export async function shareLink(url, title) {
  if (nativeApp) { await Share.share({ title, url, dialogTitle: title }); return 'shared'; }
  if (navigator.share) { await navigator.share({ title, url }); return 'shared'; }
  await navigator.clipboard.writeText(url);
  return 'copied';
}

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
export async function clearReviewReminders() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('ongi-review-reminder:')) localStorage.removeItem(key);
    }
  } catch {}
  await syncReviewReminders([]);
}
export async function reviewReminderStatus(record) {
  if (!reviewReminderEnabled(record.id)) return '이 기기에서 알림 꺼짐';
  try {
    await reminderSync;
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return '기기 설정에서 알림 권한이 필요해요.';
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.some(notification => notification.id === reminderId(record.id))) return '이 기기에 알림이 예약됐어요.';
    return reviewReminders([record]).length ? '이 기기에 알림이 예약되지 않았어요.' : '예약할 회고 시간이 없어요.';
  } catch { return '알림 예약 상태를 확인하지 못했어요.'; }
}

let reminderSync = Promise.resolve();
let reminderRecords = [];
let reminderVersion = 0;
export function syncReviewReminders(records, { requestPermission = true } = {}) {
  reminderRecords = records.map(record => ({ ...record }));
  reminderVersion++;
  if (!nativeApp) return reminderSync;
  const wanted = [...dailyReminder(), ...reviewReminders(noteMode ? records : records.filter(record => reviewReminderEnabled(record.id)))];
  reminderSync = reminderSync.then(() => scheduleReviewReminders(wanted, requestPermission));
  return reminderSync;
}

async function scheduleReviewReminders(wanted, requestPermission) {
  try {
    const { notifications: pending } = await LocalNotifications.getPending();
    if (pending.length) await LocalNotifications.cancel({ notifications: pending.map(({ id }) => ({ id })) });
    if (!wanted.length) return;
    let { display } = await LocalNotifications.checkPermissions();
    if (requestPermission && (display === 'prompt' || display === 'prompt-with-rationale')) ({ display } = await LocalNotifications.requestPermissions());
    if (display !== 'granted') return;
    await LocalNotifications.schedule({
      notifications: wanted.map(n => ({ ...(Capacitor.getPlatform() === 'android' ? { isExactNotification: false } : {}), id: n.id, title: n.title, body: n.body, schedule: n.schedule || { at: n.at }, extra: n.extra }))
    });
  } catch {
    // Reminders are a convenience; records are already saved on the server.
  }
}

export async function setupNativeShell({ back, notify, openRecord, openPage, remindersChanged }) {
  if (!nativeApp || started) return;
  started = true;
  document.documentElement.classList.add('native-app');

  await App.addListener('backButton', async ({ canGoBack }) => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { if(!dialog.classList.contains('age-gate'))dialog.close(); return; }
    if (await back?.()) return;
    if (canGoBack) history.back();
    else await App.exitApp();
  });

  await App.addListener('appStateChange', async ({ isActive }) => {
    if (!isActive || !reminderVersion) return;
    // Recover permission changes immediately, even offline; never prompt on resume.
    const syncing = syncReviewReminders(reminderRecords, { requestPermission: false });
    const version = reminderVersion;
    await syncing;
    if (version !== reminderVersion) return;
    remindersChanged?.();
    try {
      const { response, body } = await getJournal(noteMode);
      const records = body.data === null ? [] : body.data?.records;
      // Saving, clearing or switching journals while this read was in flight wins.
      if (version === reminderVersion) {
        if (response.status === 401) {
          await syncReviewReminders([], { requestPermission: false });
          remindersChanged?.();
        }
        else if (response.ok && Number.isSafeInteger(body.revision) && Array.isArray(records) &&
          records.every(record => record && typeof record === 'object')) {
          await syncReviewReminders(records, { requestPermission: false });
          remindersChanged?.();
        }
      }
    } catch { /* Keep the last known reservations when offline or the server is unavailable. */ }
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
    else if (notification.extra?.page) openPage?.(notification.extra.page);
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
