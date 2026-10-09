-- Preserve existing accounts and serialize registration numbering in PostgreSQL.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
CREATE SEQUENCE subscriber_account_number AS bigint;
SELECT setval(
  'subscriber_account_number',
  GREATEST(COALESCE(MAX(substring(account_no FROM 6)::bigint), 0), 1),
  COALESCE(MAX(substring(account_no FROM 6)::bigint), 0) > 0
) FROM subscribers WHERE account_no ~ '^BCIS-[0-9]{1,15}$';

CREATE FUNCTION next_subscriber_account_no() RETURNS text LANGUAGE plpgsql AS $$
DECLARE number_text text; candidate text;
BEGIN
  LOOP
    number_text := nextval('subscriber_account_number')::text;
    candidate := 'BCIS-' || lpad(number_text, GREATEST(5, length(number_text)), '0');
    -- Explicitly seeded or legacy account numbers remain reserved.
    IF NOT EXISTS (SELECT 1 FROM subscribers WHERE account_no = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END $$;
ALTER TABLE subscribers ALTER COLUMN account_no SET DEFAULT next_subscriber_account_no();
