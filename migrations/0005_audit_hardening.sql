-- intent: audit hardening. Lookup indexes for ownership/FK paths, an identity tombstone so a deleted
-- account cannot regain membership, and privilege/trigger fences on retained evidence.
CREATE INDEX memberships_user ON product.memberships(user_id);
CREATE INDEX citations_chunk ON product.citations(institution_id,chunk_id);
CREATE INDEX ingestion_jobs_version ON product.ingestion_jobs(institution_id,version_id);
CREATE INDEX conversations_owner ON product.conversations(institution_id,user_id,created_at);
CREATE INDEX feedback_page ON product.feedback(institution_id,created_at,id);
CREATE INDEX idempotency_keys_expiry ON product.idempotency_keys(expires_at);

-- SHA256 of the opaque Better Auth user ID only; no email or profile data.
CREATE TABLE product.deleted_identities (
 user_sha256 text PRIMARY KEY CHECK(user_sha256 ~ '^[a-f0-9]{64}$'),
 deleted_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON product.deleted_identities FROM PUBLIC;
GRANT SELECT, INSERT ON product.deleted_identities TO noti_school_api;

-- The runtime role deletes only personal/request tables (memberships, invitations, conversations,
-- feedback, idempotency_keys). Conversation cascades into answers/citations run as the table owner.
REVOKE DELETE ON product.institutions, product.sources, product.source_versions, product.chunks,
 product.graph_entities, product.graph_edges, product.ingestion_jobs, product.answers, product.citations
 FROM noti_school_api;
CREATE FUNCTION product.retained_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'evidence is retained; archive the version instead of deleting it';
END $$;
CREATE TRIGGER retained_source_versions BEFORE DELETE ON product.source_versions FOR EACH ROW EXECUTE FUNCTION product.retained_evidence();
CREATE TRIGGER retained_chunks BEFORE DELETE ON product.chunks FOR EACH ROW EXECUTE FUNCTION product.retained_evidence();
CREATE TRIGGER retained_graph_edges BEFORE DELETE ON product.graph_edges FOR EACH ROW EXECUTE FUNCTION product.retained_evidence();

-- Revoking a membership expires unredeemed invitations to the same invitee (matched by the email
-- HMAC of invitations that user redeemed) and those the revoked member issued in that institution.
CREATE FUNCTION product.expire_revoked_invitations() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE product.invitations i SET expires_at=now()
 WHERE i.institution_id=NEW.institution_id AND i.redeemed_at IS NULL AND i.expires_at>now()
 AND (i.created_by=NEW.user_id OR i.email_hash IN (SELECT r.email_hash FROM product.invitations r
  WHERE r.institution_id=NEW.institution_id AND r.redeemed_by=NEW.user_id));
 RETURN NULL;
END $$;
CREATE TRIGGER expire_revoked_invitations AFTER UPDATE OF revoked_at ON product.memberships FOR EACH ROW
 WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL) EXECUTE FUNCTION product.expire_revoked_invitations();
