-- intent: product-owned, institution-scoped evidence; Better Auth owns only auth.*.
CREATE TABLE product.institutions (
 id uuid PRIMARY KEY, slug text NOT NULL UNIQUE, name text NOT NULL,
 coverage text NOT NULL DEFAULT 'none' CHECK (coverage IN ('none','synthetic_demo','approved_sources'))
);
CREATE TABLE product.memberships (
 institution_id uuid NOT NULL REFERENCES product.institutions, user_id text NOT NULL,
 role text NOT NULL CHECK (role IN ('student','admin')), revoked_at timestamptz,
 PRIMARY KEY (institution_id,user_id)
);
CREATE TABLE product.invitations (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 token_hash text NOT NULL UNIQUE, email_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('student','admin')), expires_at timestamptz NOT NULL,
 redeemed_by text, redeemed_at timestamptz, created_by text NOT NULL
);
CREATE TABLE product.sources (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 title text NOT NULL, kind text NOT NULL CHECK (kind IN ('pdf','text','url')),
 original_url text, visibility text NOT NULL CHECK (visibility IN ('institution','admin')),
 current_version_id uuid, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(institution_id,id)
);
CREATE TABLE product.source_versions (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, source_id uuid NOT NULL,
 label text NOT NULL, sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 storage_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quarantined','pending_review','approved','archived','failed')),
 indexing text NOT NULL DEFAULT 'pending' CHECK (indexing IN ('pending','running','ready','failed','disabled')),
 effective_from timestamptz, effective_until timestamptz, approved_by text, approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from),
 CHECK (status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
 FOREIGN KEY(institution_id,source_id) REFERENCES product.sources(institution_id,id),
 UNIQUE(institution_id,source_id,id), UNIQUE(institution_id,id), UNIQUE(source_id,sha256)
);
ALTER TABLE product.sources ADD FOREIGN KEY(institution_id,id,current_version_id) REFERENCES product.source_versions(institution_id,source_id,id);
CREATE TABLE product.chunks (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, source_id uuid NOT NULL, version_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal >= 0), content text NOT NULL,
 language text NOT NULL CHECK(language IN ('en','vi')), page integer CHECK(page > 0), section text,
 start_char integer NOT NULL CHECK(start_char >= 0), end_char integer NOT NULL,
 embedding public.vector(1536), embedding_model text CHECK(embedding_model = 'text-embedding-3-small'),
 lexical tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
 CHECK(end_char > start_char), CHECK(page IS NOT NULL OR section IS NOT NULL),
 CHECK((embedding IS NULL) = (embedding_model IS NULL)),
 FOREIGN KEY(institution_id,source_id,version_id) REFERENCES product.source_versions(institution_id,source_id,id),
 UNIQUE(version_id,ordinal), UNIQUE(institution_id,id), UNIQUE(institution_id,version_id,id)
);
CREATE INDEX chunks_lexical ON product.chunks USING gin(lexical);
CREATE INDEX chunks_embedding ON product.chunks USING hnsw(embedding public.vector_cosine_ops);
CREATE FUNCTION product.immutable_chunk_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.institution_id,NEW.source_id,NEW.version_id,NEW.ordinal,NEW.content,NEW.language,NEW.page,NEW.section,NEW.start_char,NEW.end_char)
 IS DISTINCT FROM ROW(OLD.id,OLD.institution_id,OLD.source_id,OLD.version_id,OLD.ordinal,OLD.content,OLD.language,OLD.page,OLD.section,OLD.start_char,OLD.end_char)
 THEN RAISE EXCEPTION 'chunk evidence is immutable; create a new version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_chunk_content BEFORE UPDATE ON product.chunks FOR EACH ROW EXECUTE FUNCTION product.immutable_chunk_content();
CREATE FUNCTION product.immutable_version_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.institution_id,NEW.source_id,NEW.sha256,NEW.storage_key,NEW.label)
 IS DISTINCT FROM ROW(OLD.id,OLD.institution_id,OLD.source_id,OLD.sha256,OLD.storage_key,OLD.label)
 THEN RAISE EXCEPTION 'source version identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_version_identity BEFORE UPDATE ON product.source_versions FOR EACH ROW EXECUTE FUNCTION product.immutable_version_identity();
CREATE TABLE product.graph_entities (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 kind text NOT NULL CHECK(kind IN ('course','procedure','regulation','office','form','program')),
 label text NOT NULL, UNIQUE(institution_id,id)
);
CREATE TABLE product.graph_edges (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, from_entity_id uuid NOT NULL, to_entity_id uuid NOT NULL,
 relation text NOT NULL, status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','approved','rejected')),
 evidence_chunk_id uuid NOT NULL, approved_by text,
 CHECK(status <> 'approved' OR approved_by IS NOT NULL),
 FOREIGN KEY(institution_id,from_entity_id) REFERENCES product.graph_entities(institution_id,id),
 FOREIGN KEY(institution_id,to_entity_id) REFERENCES product.graph_entities(institution_id,id),
 FOREIGN KEY(institution_id,evidence_chunk_id) REFERENCES product.chunks(institution_id,id), UNIQUE(institution_id,id)
);
CREATE TABLE product.conversations (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL REFERENCES product.institutions,
 user_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(institution_id,id)
);
CREATE TABLE product.answers (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, conversation_id uuid NOT NULL,
 language text NOT NULL CHECK(language IN ('en','vi')), question text NOT NULL,
 status text NOT NULL CHECK(status IN ('answered','qualified','abstained')),
 claims jsonb NOT NULL CHECK(jsonb_typeof(claims) = 'array'), explanation text,
 trace jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,conversation_id) REFERENCES product.conversations(institution_id,id) ON DELETE CASCADE,
 UNIQUE(institution_id,id)
);
CREATE TABLE product.citations (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, answer_id uuid NOT NULL, chunk_id uuid NOT NULL,
 quote text NOT NULL, FOREIGN KEY(institution_id,answer_id) REFERENCES product.answers(institution_id,id) ON DELETE CASCADE,
 FOREIGN KEY(institution_id,chunk_id) REFERENCES product.chunks(institution_id,id), UNIQUE(institution_id,answer_id,id)
);
CREATE TABLE product.feedback (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, answer_id uuid NOT NULL, user_id text NOT NULL,
 evidence_id uuid, category text NOT NULL CHECK(category IN ('unsupported','incorrect','outdated','other')),
 comment text CHECK(length(comment) <= 2000), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,answer_id) REFERENCES product.answers(institution_id,id) ON DELETE CASCADE,
 FOREIGN KEY(institution_id,answer_id,evidence_id) REFERENCES product.citations(institution_id,answer_id,id)
);
CREATE TABLE product.ingestion_jobs (
 id uuid PRIMARY KEY, institution_id uuid NOT NULL, version_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('queued','running','succeeded','failed','disabled')),
 attempt integer NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(institution_id,version_id) REFERENCES product.source_versions(institution_id,id)
);
-- Scope is checked by API queries on every request; no claim of RLS enforcement.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA product TO noti_school_api;
