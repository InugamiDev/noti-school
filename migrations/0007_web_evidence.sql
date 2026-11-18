-- intent: Jev-scored web evidence (TinyFish cache), evidence ontology confidence and personal spaces
-- (owner decision 2026-11-18). Every cache, score and graph row stays inside one institution.
-- status: done | next: live TinyFish/Jev evaluation | confidence: medium

-- Lowercase ASCII (IDNA/punycode) hostnames only, no IP literals, no duplicates, at most 20.
CREATE FUNCTION product.valid_domains(p text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT coalesce(cardinality(p),0) <= 20
  AND NOT EXISTS(SELECT 1 FROM unnest(p) d WHERE d IS NULL OR length(d) NOT BETWEEN 3 AND 253
   OR d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' OR d ~ '^[0-9.]+$')
  AND (SELECT count(DISTINCT d) FROM unnest(p) d) = coalesce(cardinality(p),0)
$$;
ALTER TABLE product.institutions
 ADD COLUMN kind text NOT NULL DEFAULT 'school' CHECK(kind IN ('school','personal')),
 ADD COLUMN owner_user_id text CHECK(owner_user_id IS NULL OR length(owner_user_id) BETWEEN 1 AND 600),
 ADD COLUMN domains text[] NOT NULL DEFAULT '{}' CHECK(product.valid_domains(domains)),
 ADD CONSTRAINT institutions_personal_owner CHECK((kind = 'personal') = (owner_user_id IS NOT NULL));
ALTER TABLE product.institutions DROP CONSTRAINT institutions_coverage_check,
 ADD CONSTRAINT institutions_coverage_check CHECK(coverage IN ('none','synthetic_demo','approved_sources','web_discovery'));
CREATE UNIQUE INDEX institutions_one_personal_space ON product.institutions(owner_user_id) WHERE kind = 'personal';
CREATE FUNCTION product.immutable_institution_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind IS DISTINCT FROM OLD.kind THEN RAISE EXCEPTION 'institution kind is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_institution_kind BEFORE UPDATE ON product.institutions FOR EACH ROW EXECUTE FUNCTION product.immutable_institution_kind();

-- Web captures live in ordinary sources/versions/chunks so citations keep FK provenance, but they are
-- labelled origin 'web' and their versions stay 'draft': never institution-approved.
ALTER TABLE product.sources ADD COLUMN origin text NOT NULL DEFAULT 'approved' CHECK(origin IN ('approved','web'));
CREATE FUNCTION product.immutable_source_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.origin IS DISTINCT FROM OLD.origin THEN RAISE EXCEPTION 'source origin is immutable; promote creates a new source'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_source_origin BEFORE UPDATE ON product.sources FOR EACH ROW EXECUTE FUNCTION product.immutable_source_origin();

-- Per-institution TinyFish page cache. Fresh for exactly 168 hours (absolute time, independent of the
-- session TimeZone and DST); 'stale' may also be forced by an admin.
CREATE TABLE product.web_documents (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 url text NOT NULL CHECK(url ~ '^https://' AND length(url) <= 2048),
 final_url text NOT NULL CHECK(final_url ~ '^https://' AND length(final_url) <= 2048),
 -- Comparison keys (apps/api web::url_key): scheme, host case, default port, fragment, trailing slash and
 -- tracking parameters removed. Blocking and cache lookup match these, never the raw URL alone.
 url_key text NOT NULL CHECK(url_key ~ '^https://' AND length(url_key) <= 2048),
 final_url_key text NOT NULL CHECK(final_url_key ~ '^https://' AND length(final_url_key) <= 2048),
 domain text NOT NULL CHECK(length(domain) BETWEEN 1 AND 253),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 500),
 language text CHECK(language IN ('en','vi')),
 fetched_at timestamptz NOT NULL, stale_after timestamptz NOT NULL,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 etag text CHECK(length(etag) <= 512), last_modified text CHECK(length(last_modified) <= 128),
 state text NOT NULL DEFAULT 'fresh' CHECK(state IN ('fresh','stale','failed')),
 blocked boolean NOT NULL DEFAULT false, blocked_by text, blocked_at timestamptz,
 source_id uuid, promoted_source_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(stale_after = fetched_at + interval '168 hours'),
 CHECK(NOT blocked OR (blocked_by IS NOT NULL AND blocked_at IS NOT NULL)),
 FOREIGN KEY(institution_id,source_id) REFERENCES product.sources(institution_id,id),
 FOREIGN KEY(institution_id,promoted_source_id) REFERENCES product.sources(institution_id,id),
 UNIQUE(institution_id,url), UNIQUE(institution_id,id)
);
CREATE INDEX web_documents_url_key ON product.web_documents(institution_id,url_key);
CREATE INDEX web_documents_final_url_key ON product.web_documents(institution_id,final_url_key);
CREATE INDEX web_documents_page ON product.web_documents(institution_id,created_at,id);
CREATE UNIQUE INDEX web_documents_source ON product.web_documents(institution_id,source_id) WHERE source_id IS NOT NULL;
-- Search cache keyed by a normalized parameter hash; params exclude the raw query text.
CREATE TABLE product.web_searches (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 query_sha256 text NOT NULL CHECK(query_sha256 ~ '^[a-f0-9]{64}$'),
 params jsonb NOT NULL CHECK(jsonb_typeof(params) = 'object'),
 results jsonb NOT NULL CHECK(jsonb_typeof(results) = 'array' AND jsonb_array_length(results) <= 100),
 fetched_at timestamptz NOT NULL, UNIQUE(institution_id,query_sha256)
);
CREATE INDEX web_searches_age ON product.web_searches(fetched_at);
-- Application self-limits below the shared TinyFish free allowance (UTC day, global across tenants).
CREATE TABLE product.web_usage (
 day date NOT NULL, kind text NOT NULL CHECK(kind IN ('search','fetch')),
 used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 12000), PRIMARY KEY(day,kind)
);
-- Each institution's (school or personal space) share of the same UTC day, charged together with
-- web_usage so one space cannot exhaust discovery for every other tenant.
CREATE TABLE product.web_space_usage (
 day date NOT NULL, institution_id uuid NOT NULL REFERENCES product.institutions,
 kind text NOT NULL CHECK(kind IN ('search','fetch')),
 used integer NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 12000), PRIMARY KEY(day,institution_id,kind)
);
-- Jev confidence per chunk and question hash (no question text). Overall is recomputed from the
-- stored components with the institution's current domains when used.
CREATE TABLE product.evidence_scores (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, chunk_id uuid NOT NULL,
 question_sha256 text NOT NULL CHECK(question_sha256 ~ '^[a-f0-9]{64}$'),
 school numeric(4,3) NOT NULL CHECK(school BETWEEN 0 AND 1),
 source numeric(4,3) NOT NULL CHECK(source BETWEEN 0 AND 1),
 relevance numeric(4,3) NOT NULL CHECK(relevance BETWEEN 0 AND 1),
 answers numeric(4,3) NOT NULL CHECK(answers BETWEEN 0 AND 1),
 injection numeric(4,3) NOT NULL CHECK(injection BETWEEN 0 AND 1),
 overall numeric(4,3) NOT NULL CHECK(overall BETWEEN 0 AND 1),
 model text NOT NULL CHECK(length(model) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,chunk_id) REFERENCES product.chunks(institution_id,id),
 UNIQUE(institution_id,chunk_id,question_sha256,model)
);

-- Ontology: new kinds, case-folded dedupe and Jev relation confidence. Graph metadata is never evidence.
ALTER TABLE product.graph_entities DROP CONSTRAINT graph_entities_kind_check,
 ADD CONSTRAINT graph_entities_kind_check CHECK(kind IN ('course','procedure','regulation','office','form','program','deadline','fee','topic'));
-- Before 0007 labels were not unique, so earlier admins may have created case duplicates. Merge each
-- (institution_id,kind,lower(label)) group into its oldest entity: graph_entities has no creation time,
-- so "oldest" is the earliest inserting transaction (largest age(xmin)), ties broken by id. Edges are
-- repointed, never deleted, so every relation keeps its evidence chunk; only unreferenced duplicate
-- entity rows (labels, not evidence) are removed.
-- A transient view, not a temporary table: provisioning revokes TEMPORARY on the database.
CREATE VIEW product.graph_entity_merge AS SELECT duplicate_id, keep_id FROM (
 SELECT id AS duplicate_id, first_value(id) OVER (PARTITION BY institution_id,kind,lower(label) ORDER BY age(xmin) DESC,id) AS keep_id
 FROM product.graph_entities) g WHERE duplicate_id <> keep_id;
UPDATE product.graph_edges e SET from_entity_id = m.keep_id FROM product.graph_entity_merge m WHERE e.from_entity_id = m.duplicate_id;
UPDATE product.graph_edges e SET to_entity_id = m.keep_id FROM product.graph_entity_merge m WHERE e.to_entity_id = m.duplicate_id;
DELETE FROM product.graph_entities g USING product.graph_entity_merge m WHERE g.id = m.duplicate_id;
DROP VIEW product.graph_entity_merge;
CREATE UNIQUE INDEX graph_entities_dedupe ON product.graph_entities(institution_id,kind,lower(label));
ALTER TABLE product.graph_edges ADD COLUMN confidence numeric(4,3) CHECK(confidence BETWEEN 0 AND 1);
CREATE INDEX graph_edges_evidence ON product.graph_edges(institution_id,evidence_chunk_id);
CREATE TABLE product.ontology_jobs (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, version_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','disabled')),
 batch integer NOT NULL DEFAULT 0 CHECK(batch BETWEEN 0 AND 4),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,version_id) REFERENCES product.source_versions(institution_id,id),
 UNIQUE(version_id)
);
CREATE INDEX ontology_jobs_queue ON product.ontology_jobs(state,updated_at);

-- Citation snapshot of web provenance and confidence at answer time.
ALTER TABLE product.citations
 ADD COLUMN confidence jsonb CHECK(confidence IS NULL OR jsonb_typeof(confidence) = 'object'),
 ADD COLUMN retrieved_at timestamptz, ADD COLUMN domain text CHECK(length(domain) <= 253);

GRANT SELECT, INSERT, UPDATE ON product.web_documents, product.web_usage, product.web_space_usage, product.evidence_scores, product.ontology_jobs TO noti_school_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON product.web_searches TO noti_school_api;
-- Cached pages and scores back citations; they are retained like other evidence.
CREATE TRIGGER retained_web_documents BEFORE DELETE ON product.web_documents FOR EACH ROW EXECUTE FUNCTION product.retained_evidence();
CREATE TRIGGER retained_evidence_scores BEFORE DELETE ON product.evidence_scores FOR EACH ROW EXECUTE FUNCTION product.retained_evidence();
