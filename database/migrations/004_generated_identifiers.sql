CREATE SEQUENCE service_account_number;
CREATE SEQUENCE service_plan_number;
CREATE FUNCTION next_service_account_no() RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
 LOOP
  candidate := 'SVC-' || to_char(nextval('service_account_number'), 'FM0000000000');
  IF NOT EXISTS(SELECT 1 FROM service_accounts WHERE account_no=candidate) THEN RETURN candidate; END IF;
 END LOOP;
END $$;
CREATE FUNCTION next_service_plan_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE candidate text;
BEGIN
 LOOP
  candidate := 'PLAN-' || to_char(nextval('service_plan_number'), 'FM0000000000');
  IF NOT EXISTS(SELECT 1 FROM service_plans WHERE code=candidate) THEN RETURN candidate; END IF;
 END LOOP;
END $$;
ALTER TABLE service_accounts ALTER COLUMN account_no SET DEFAULT next_service_account_no();
ALTER TABLE service_plans ALTER COLUMN code SET DEFAULT next_service_plan_code();
CREATE TABLE identifier_reservations(token uuid PRIMARY KEY, kind text NOT NULL, value text NOT NULL, actor_id int NOT NULL REFERENCES users, UNIQUE(kind,value));
