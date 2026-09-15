// 대화 캡처. 고른 말풍선만 이미지로 그립니다. DOM을 통째로 복사하는
// 라이브러리를 쓰지 않고 캔버스에 직접 그리므로, 번들이 늘지 않고 화면에
// 떠 있는 것(내비·토글·저장 배지)이 섞여 들어갈 일도 없습니다.
const S = 2;                       // 그리는 배율. 저장본이 흐릿해지지 않게.
const W = 380;                     // 논리 폭
const PAD = 18, GAP = 13, AVATAR = 30;
const TIME_W = 34;                 // 말풍선 옆 시각이 차지하는 자리
const BUBBLE_MAX = W - PAD * 2 - AVATAR - 10 - TIME_W;
const INK = '#1d2b25', SUB = '#8b7750', LINE = '#e2ddcc';
const PAPER = '#f6f2e6', MINE = '#1b5148', THEIRS = '#ffffff';

const font = (size, weight = 400) => `${weight} ${size}px 'Maru Buri', serif`;

// 도령 얼굴. 같은 출처라 캔버스가 오염되지 않고, 못 불러오면 글자로 대신합니다.
let avatarPromise = null;
const loadAvatar = () => (avatarPromise ??= new Promise(res => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => res(null);
  img.src = '/assets/mentorAvatar.webp';
}));

// 원으로 오려 붙입니다. 원본이 정사각형이 아니어도 가운데가 남게 잘라요.
function circleImage(ctx, img, cx, cy, r) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) * 0.18;   // 얼굴이 위쪽에 있어 조금 올려 자릅니다
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.drawImage(img, sx, Math.max(0, sy), side, side, cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// 캔버스에는 줄바꿈이 없으므로 직접 끊습니다. 원문의 개행은 그대로 지킵니다.
function wrap(ctx, text, max) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > max && line) { out.push(line); line = ch; }
      else line += ch;
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 1단계: 높이를 먼저 재고, 2단계에서 그립니다. 캔버스는 나중에 크기를
// 바꾸면 내용이 지워지므로 총높이를 알아야 시작할 수 있습니다.
function layout(ctx, messages) {
  const rows = [];
  let y = 0;
  for (const m of messages) {
    ctx.font = font(13.5);
    const lines = wrap(ctx, m.text, BUBBLE_MAX - 26);
    const h = lines.length * 21 + 22;
    rows.push({ m, lines, h, y });
    y += h + GAP + (m.role === 'assistant' ? 15 : 0);
  }
  return { rows, height: y };
}

export async function captureMessages(messages, { title = '달빛 도령', subtitle = '' } = {}) {
  const [, avatar] = await Promise.all([document.fonts.ready, loadAvatar()]);
  const probe = document.createElement('canvas').getContext('2d');
  const { rows, height } = layout(probe, messages);

  const headH = 62, footH = 40;
  const total = headH + PAD + height + footH;
  const cv = document.createElement('canvas');
  cv.width = W * S; cv.height = total * S;
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  ctx.textBaseline = 'top';

  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, total);

  // 머리말
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, headH);
  ctx.strokeStyle = LINE; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, headH - .5); ctx.lineTo(W, headH - .5); ctx.stroke();
  ctx.fillStyle = MINE;
  ctx.beginPath(); ctx.arc(PAD + 15, headH / 2, 15, 0, Math.PI * 2); ctx.fill();
  if (avatar) circleImage(ctx, avatar, PAD + 15, headH / 2, 15);
  else { ctx.fillStyle = '#f4ecd8'; ctx.font = font(13, 600); ctx.fillText('달', PAD + 8, headH / 2 - 9); }
  ctx.fillStyle = INK; ctx.font = font(14.5, 600);
  ctx.fillText(title, PAD + 40, headH / 2 - (subtitle ? 15 : 8));
  if (subtitle) { ctx.fillStyle = SUB; ctx.font = font(11); ctx.fillText(subtitle, PAD + 40, headH / 2 + 3); }

  // 말풍선
  for (const { m, lines, h, y } of rows) {
    const top = headH + PAD + y;
    ctx.font = font(13.5);
    const wide = Math.max(...lines.map(l => ctx.measureText(l).width), 40) + 26;
    const mine = m.role === 'user';
    const x = mine ? W - PAD - wide : PAD + AVATAR + 8;

    if (!mine) {
      ctx.fillStyle = MINE;
      ctx.beginPath(); ctx.arc(PAD + AVATAR / 2, top + AVATAR / 2, AVATAR / 2, 0, Math.PI * 2); ctx.fill();
      if (avatar) circleImage(ctx, avatar, PAD + AVATAR / 2, top + AVATAR / 2, AVATAR / 2);
      else { ctx.fillStyle = '#f4ecd8'; ctx.font = font(12, 600); ctx.fillText('달', PAD + 9, top + 8); }
    }
    ctx.fillStyle = mine ? MINE : THEIRS;
    roundRect(ctx, x, top, wide, h, 14); ctx.fill();
    if (!mine) { ctx.strokeStyle = LINE; ctx.stroke(); }

    ctx.fillStyle = mine ? '#f2ecd9' : INK;
    ctx.font = font(13.5);
    lines.forEach((l, i) => ctx.fillText(l, x + 13, top + 11 + i * 21));

    ctx.fillStyle = SUB; ctx.font = font(10);
    const t = m.at ? new Date(m.at).toTimeString().slice(0, 5) : '';
    if (t) {
      const tw = ctx.measureText(t).width;
      ctx.fillText(t, mine ? x - tw - 6 : x + wide + 6, top + h - 14);
    }
  }

  // 꼬리말
  ctx.fillStyle = SUB; ctx.font = font(10.5);
  const foot = '달빛 사주 · 상담 기록';
  ctx.fillText(foot, (W - ctx.measureText(foot).width) / 2, total - footH + 14);

  return new Promise(res => cv.toBlob(res, 'image/png'));
}
