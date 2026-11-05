-- Nullable: past records and responses without routing metadata stay unknown.
ALTER TABLE llm_requests ADD COLUMN routing_provider varchar(64);
ALTER TABLE llm_requests ADD COLUMN resolved_model varchar(160);
