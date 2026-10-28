// The iOS app ships as "달빛 노트": choice records and reviews only, without the
// saju reading, daily flow or AI consultation (App Store guideline 4.3).
// Android, the web and Apps in Toss keep the full 달빛 사주 service.
// On the web, ?app=note previews the same screens for this browser tab.
export const NOTE_PAGES = ['welcome', 'choice', 'records', 'settings'];

export function resolveNoteMode({ platform, search = '', storage = null }) {
  if (platform === 'ios') return true;
  const asked = new URLSearchParams(search).get('app');
  try {
    if (asked === 'note') storage?.setItem('dalbit-app', 'note');
    if (asked === 'saju') storage?.removeItem('dalbit-app');
    return storage?.getItem('dalbit-app') === 'note';
  } catch {
    return asked === 'note';
  }
}

// Notification ids must be 32-bit integers; record ids are UUIDs.
export function reminderId(recordId) {
  let h = 0;
  for (const c of String(recordId)) h = (Math.imul(h, 31) + c.codePointAt(0)) | 0;
  return Math.abs(h) || 1;
}

// One reminder at 20:00 device time on each pending record's review date.
// iOS keeps at most 64 pending local notifications, so the nearest 60 are kept.
export function reviewReminders(records, nowMs = Date.now()) {
  return records
    .filter(r => r.result === 'pending' && /^\d{4}-\d{2}-\d{2}$/.test(r.due || ''))
    .map(r => {
      const [y, m, d] = r.due.split('-').map(Number);
      return {
        id: reminderId(r.id),
        title: '선택을 돌아볼 시간이에요',
        body: `“${r.title}” 그 뒤로 어떻게 되었나요? 결과와 마음을 남겨 보세요.`,
        at: new Date(y, m - 1, d, 20, 0, 0),
        extra: { recordId: r.id }
      };
    })
    .filter(n => n.at.getTime() > nowMs)
    .sort((a, b) => a.at - b.at)
    .slice(0, 60);
}
