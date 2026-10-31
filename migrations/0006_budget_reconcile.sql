-- intent: operator-only reconciliation of dispatched/uncertain holds; history is append-only.
CREATE TABLE product.ai_reconciliations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reservation_id uuid NOT NULL REFERENCES product.ai_reservations, prior_state text NOT NULL CHECK(prior_state IN ('dispatched','uncertain')),
 reserved_micro_usd bigint NOT NULL CHECK(reserved_micro_usd > 0),
 actual_micro_usd bigint NOT NULL CHECK(actual_micro_usd >= 0 AND actual_micro_usd <= reserved_micro_usd),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 500),
 reconciled_by text NOT NULL, reconciled_at timestamptz NOT NULL DEFAULT now(), UNIQUE(reservation_id)
);
CREATE FUNCTION product.immutable_ai_reconciliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'reconciliation records are immutable'; END $$;
CREATE TRIGGER immutable_ai_reconciliation BEFORE UPDATE OR DELETE ON product.ai_reconciliations FOR EACH ROW EXECUTE FUNCTION product.immutable_ai_reconciliation();
REVOKE ALL ON product.ai_reconciliations FROM PUBLIC, noti_school_api;

-- The operator supplies the authoritative provider-billed amount (or zero only with proof of no
-- charge). It cannot exceed the hold; a larger charge must be settled from complete usage.
CREATE FUNCTION product.reconcile_ai(p_id uuid, p_actual_micro_usd bigint, p_reason text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, product AS $$
DECLARE r product.ai_reservations;
BEGIN
 PERFORM pg_advisory_xact_lock(718443901);
 SELECT * INTO STRICT r FROM product.ai_reservations WHERE id = p_id FOR UPDATE;
 IF r.state NOT IN ('dispatched','uncertain') THEN RAISE EXCEPTION 'reservation not awaiting reconciliation'; END IF;
 IF p_actual_micro_usd IS NULL OR p_actual_micro_usd < 0 OR p_actual_micro_usd > r.reserved_micro_usd THEN RAISE EXCEPTION 'reconciled amount outside reserved hold'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'reconciliation reason required'; END IF;
 INSERT INTO product.ai_reconciliations(reservation_id,prior_state,reserved_micro_usd,actual_micro_usd,reason,reconciled_by)
   VALUES(r.id,r.state,r.reserved_micro_usd,p_actual_micro_usd,p_reason,session_user);
 -- Charged to the reservation month, matching late settlement.
 UPDATE product.ai_months SET reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd, spent_micro_usd = spent_micro_usd + p_actual_micro_usd WHERE month = r.month;
 UPDATE product.ai_reservations SET state = 'settled', actual_micro_usd = p_actual_micro_usd WHERE id = p_id;
 RETURN p_actual_micro_usd;
END $$;
-- Not granted to the runtime role and no HTTP route: only the migration/operator owner executes it.
REVOKE ALL ON FUNCTION product.reconcile_ai(uuid,bigint,text) FROM PUBLIC, noti_school_api;
