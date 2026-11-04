// Aggregate inventory only. This does not determine legal expiry or delete records.
export async function retentionAudit(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const { rows: [orders] } = await client.query(`SELECT
      count(*)::text AS total,
      count(*) FILTER (WHERE user_id IS NULL)::text AS unlinked,
      count(*) FILTER (WHERE user_id IS NOT NULL AND NOT refunded AND used < 50 AND expires_at > now())::text AS locally_usable,
      count(*) FILTER (WHERE expires_at <= now())::text AS expired,
      count(*) FILTER (WHERE refunded)::text AS refunded,
      count(*) FILTER (WHERE used = 50)::text AS exhausted,
      count(*) FILTER (WHERE created_at <= now() - interval '1 year')::text AS stored_over_one_year,
      count(*) FILTER (WHERE purchased_at > now() + interval '1 minute' OR expires_at < purchased_at)::text AS inconsistent_dates
      FROM toss_coach_orders`);
    const { rows: [answers] } = await client.query(`SELECT
      count(*)::text AS total,
      count(*) FILTER (WHERE created_at <= now() - interval '30 days')::text AS stored_over_30_days,
      count(*) FILTER (WHERE created_at <= now() - interval '1 year')::text AS stored_over_one_year
      FROM coach_answers`);
    const { rows: [operational] } = await client.query(`SELECT
      (SELECT count(*)::text FROM auth_sessions WHERE expires_at <= now()) AS expired_auth_sessions,
      (SELECT count(*)::text FROM usage_sessions WHERE COALESCE(completed_at, started_at) <= now() - interval '30 days') AS expired_usage_sessions,
      (SELECT count(*)::text FROM llm_requests WHERE created_at <= now() - interval '30 days') AS expired_llm_requests,
      (SELECT count(*)::text FROM audit_logs WHERE created_at <= now() - interval '30 days') AS expired_audit_logs,
      (SELECT count(*)::text FROM product_event_counts WHERE day <= (now() AT TIME ZONE 'Asia/Seoul')::date - 30) AS expired_product_event_counts,
      now()::text AS checked_at`);
    await client.query('COMMIT');
    return {
      mode: 'read_only',
      notice: '건수만 확인한 보관 현황입니다. 법정 보존기간 판정·파기 대상 목록·결제 증빙이 아닙니다. 주문 상태별 건수는 중복될 수 있으며 locally_usable은 외부 토스 환불 상태를 재조회한 결과가 아닙니다. 30일·1년 경과는 진단용 구간이며 삭제 기준이 아닙니다. 만료된 운영 기록이 있으면 정리 작업 전후를 비교하세요.',
      orders, answers, operational
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
