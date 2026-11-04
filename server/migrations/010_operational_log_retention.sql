CREATE INDEX IF NOT EXISTS idx_llm_requests_retention ON llm_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_retention ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_sessions_retention ON usage_sessions((COALESCE(completed_at, started_at)));
