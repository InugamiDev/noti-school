-- intent: each paid stage has its own durable identity beneath the root request.
CREATE TABLE product.pipeline_stages (
 id uuid PRIMARY KEY,
 root_operation_id uuid NOT NULL REFERENCES product.idempotency_keys(operation_id),
 stage text NOT NULL CHECK(length(stage) BETWEEN 1 AND 100),
 input_sha256 text NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(root_operation_id,stage,input_sha256),
 UNIQUE(root_operation_id,stage)
);
GRANT SELECT, INSERT, UPDATE ON product.pipeline_stages TO noti_school_api;
ALTER TABLE product.source_versions ADD COLUMN language text NOT NULL DEFAULT 'en' CHECK(language IN ('en','vi'));
CREATE FUNCTION product.immutable_version_language() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.language IS DISTINCT FROM OLD.language THEN RAISE EXCEPTION 'version language is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_version_language BEFORE UPDATE ON product.source_versions FOR EACH ROW EXECUTE FUNCTION product.immutable_version_language();
CREATE INDEX pipeline_jobs_recovery ON product.ingestion_jobs(state,updated_at);
CREATE INDEX conversations_retention ON product.conversations(created_at);
