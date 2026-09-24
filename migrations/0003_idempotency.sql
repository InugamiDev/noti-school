CREATE TABLE product.idempotency_keys (
 institution_id uuid NOT NULL REFERENCES product.institutions, user_id text NOT NULL,
 key uuid NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 operation_id uuid NOT NULL UNIQUE, state text NOT NULL CHECK(state IN ('pending','completed','failed')),
 response jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 PRIMARY KEY(institution_id,user_id,key), CHECK(state <> 'completed' OR response IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON product.idempotency_keys TO noti_school_api;
