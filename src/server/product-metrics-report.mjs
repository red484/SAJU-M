import { PRODUCT_EVENTS, PRODUCT_CHANNELS } from '../shared/product-events.mjs';

const dateBefore = (day, offset) => new Date(Date.parse(`${day}T00:00:00Z`) - offset * 86_400_000).toISOString().slice(0, 10);

export async function productMetricsReport(pool) {
  // One statement gives dates and aggregates the same snapshot, including at Korean midnight.
  const { rows: [data] } = await pool.query(`WITH period AS (
    SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS today
  ) SELECT period.today::text AS today,
    COALESCE(jsonb_agg(jsonb_build_object('day',c.day::text,'channel',c.channel,'event',c.event,'count',c.count::text)
      ORDER BY c.day,c.channel,c.event) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS rows
    FROM period LEFT JOIN product_event_counts c ON c.day > period.today-30 AND c.day <= period.today
    GROUP BY period.today`);
  const { today, rows } = data;
  const start7 = dateBefore(today, 7), start14 = dateBefore(today, 14);
  const summarize = source => PRODUCT_EVENTS.map(event => {
    const values = { today: 0n, last7: 0n, previous7: 0n, last30: 0n };
    for (const row of source.filter(row => row.event === event)) {
      const count = BigInt(row.count);
      values.last30 += count;
      if (row.day === today) values.today += count;
      else if (row.day >= start7) values.last7 += count;
      else if (row.day >= start14) values.previous7 += count;
    }
    return { event, ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toString()])), change7: (values.last7 - values.previous7).toString() };
  });
  return {
    notice: '선택 동의한 기기의 동작 건수입니다. 고유 사용자·매출·개인별 전환율이 아니며 재시도·복원은 중복될 수 있습니다. 7일 비교는 오늘을 제외한 완료 날짜 기준입니다. 오늘은 부분 집계이며 빈 결과는 미수집 또는 동작 없음입니다. 동의율·개선의 인과 효과는 이 자료로 알 수 없습니다.',
    status: rows.length ? 'observed_events' : 'no_observed_events',
    periods: {
      timezone: 'Asia/Seoul', today,
      last7: { from: start7, to: dateBefore(today, 1) },
      previous7: { from: start14, to: dateBefore(today, 8) },
      last30: { from: dateBefore(today, 29), to: today }
    },
    overall: summarize(rows),
    channels: PRODUCT_CHANNELS.filter(channel => rows.some(row => row.channel === channel))
      .map(channel => ({ channel, events: summarize(rows.filter(row => row.channel === channel)) })),
    rows
  };
}
