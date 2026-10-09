ALTER TABLE audit_logs ADD COLUMN outcome text NOT NULL DEFAULT 'SUCCESS' CHECK(outcome IN ('SUCCESS','FAILURE','DENIED'));
ALTER TABLE audit_logs ADD COLUMN source_ip text;
ALTER TABLE audit_logs ADD COLUMN request_id text;
CREATE INDEX audit_security_time ON audit_logs(created_at DESC,id DESC);
