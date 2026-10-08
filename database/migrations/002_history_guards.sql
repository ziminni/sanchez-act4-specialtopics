CREATE FUNCTION deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical record is append-only'; END $$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER reversals_immutable BEFORE UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER adjustments_immutable BEFORE UPDATE OR DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER remittance_immutable BEFORE UPDATE OR DELETE ON collector_remittances FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER payment_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE TRIGGER invoice_no_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION deny_mutation();
CREATE FUNCTION preserve_payment_facts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'reversed') IS DISTINCT FROM (to_jsonb(OLD)-'reversed') OR (OLD.reversed AND NOT NEW.reversed) THEN RAISE EXCEPTION 'Posted payments cannot be edited; use a reversal'; END IF; RETURN NEW; END $$;
CREATE TRIGGER payment_facts BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION preserve_payment_facts();
CREATE FUNCTION preserve_invoice_facts() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status<>'DRAFT' AND (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN RAISE EXCEPTION 'Finalized invoice values are immutable'; END IF; RETURN NEW; END $$;
CREATE TRIGGER invoice_facts BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION preserve_invoice_facts();
CREATE UNIQUE INDEX proof_reference_normalized ON payment_proofs(upper(reference));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX subscriber_name_trgm ON subscribers USING gin(name gin_trgm_ops);
CREATE INDEX subscriber_address_trgm ON subscribers USING gin(address gin_trgm_ops);
CREATE INDEX payment_reference ON payments(reference);
CREATE INDEX batch_payment ON payments(batch_id);
CREATE INDEX proof_status ON payment_proofs(status,created_at);
CREATE UNIQUE INDEX one_pending_reconnection ON reconnection_records(service_id) WHERE completed_at IS NULL;
