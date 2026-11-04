import { createPool } from './db.mjs';
const pool = createPool();
try {
  const { rows } = await pool.query(`SELECT day::text, channel, event, count::text FROM product_event_counts
    WHERE day > (now() AT TIME ZONE 'Asia/Seoul')::date - 30 ORDER BY day,channel,event`);
  console.log(JSON.stringify({ notice: '선택 동의한 기기의 동작 건수입니다. 고유 사용자 수·구매 매출·개인별 전환율이 아니며 복원과 재시도는 중복될 수 있습니다. 빈 결과는 미수집 또는 해당 동작 없음입니다.', retention: '최근 30일(KST 날짜 기준)', rows }, null, 2));
} finally { await pool.end(); }
