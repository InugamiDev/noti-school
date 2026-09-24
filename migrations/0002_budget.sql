-- intent: serialize the combined application ceiling, including concurrent retries.
CREATE TABLE product.ai_prices (
 id text PRIMARY KEY, provider text NOT NULL CHECK(provider IN ('openai','jev')),
 model text NOT NULL, component text NOT NULL CHECK(component IN ('input_tokens','output_tokens','embedding_tokens','search_calls','search_content_tokens','jev_input_tokens','jev_output_tokens')),
 micro_usd_per_million_units bigint NOT NULL CHECK(micro_usd_per_million_units >= 0),
 effective_at timestamptz NOT NULL, valid_until timestamptz NOT NULL CHECK(valid_until > effective_at),
 source_url text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product.ai_months (
 month date PRIMARY KEY CHECK(extract(day FROM month) = 1),
 cap_micro_usd bigint NOT NULL DEFAULT 50000000 CHECK(cap_micro_usd = 50000000),
 spent_micro_usd bigint NOT NULL DEFAULT 0 CHECK(spent_micro_usd >= 0),
 reserved_micro_usd bigint NOT NULL DEFAULT 0 CHECK(reserved_micro_usd >= 0)
);
CREATE FUNCTION product.immutable_ai_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'price records are immutable; insert a new price ID'; END $$;
CREATE TRIGGER immutable_ai_price BEFORE UPDATE OR DELETE ON product.ai_prices FOR EACH ROW EXECUTE FUNCTION product.immutable_ai_price();
CREATE TABLE product.ai_reservations (
 id uuid PRIMARY KEY, month date NOT NULL REFERENCES product.ai_months,
 operation_id uuid NOT NULL, attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 3),
 plan jsonb NOT NULL, reserved_micro_usd bigint NOT NULL CHECK(reserved_micro_usd > 0),
 actual_micro_usd bigint CHECK(actual_micro_usd >= 0),
 state text NOT NULL CHECK(state IN ('reserved','dispatched','uncertain','settled','released')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(operation_id,attempt)
);
REVOKE ALL ON product.ai_prices, product.ai_months, product.ai_reservations FROM PUBLIC, noti_school_api;
GRANT SELECT ON product.ai_prices, product.ai_months, product.ai_reservations TO noti_school_api;

CREATE FUNCTION product.reserve_ai(p_id uuid, p_operation uuid, p_attempt integer, p_plan jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, product AS $$
DECLARE m date := date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date;
 amount bigint := 0; carry bigint; item jsonb; rate bigint; budget product.ai_months;
BEGIN
 -- One global transaction lock also serializes month rollover and reconciliation.
 PERFORM pg_advisory_xact_lock(718443901);
 IF jsonb_typeof(p_plan) <> 'array' OR jsonb_array_length(p_plan) NOT BETWEEN 1 AND 16 THEN RAISE EXCEPTION 'invalid cost plan'; END IF;
 IF (SELECT count(DISTINCT e->>'price_id') FROM jsonb_array_elements(p_plan) e) <> jsonb_array_length(p_plan) THEN RAISE EXCEPTION 'duplicate price'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_plan) LOOP
   IF (item->>'units') IS NULL OR (item->>'units') !~ '^[1-9][0-9]{0,12}$' THEN RAISE EXCEPTION 'invalid units'; END IF;
   SELECT micro_usd_per_million_units INTO rate FROM product.ai_prices WHERE id = item->>'price_id' AND effective_at <= clock_timestamp() AND valid_until > clock_timestamp();
   IF rate IS NULL THEN RAISE EXCEPTION 'pricing unavailable'; END IF;
   amount := amount + ceil((item->>'units')::numeric * rate / 1000000)::bigint;
 END LOOP;
 IF amount <= 0 OR amount > 50000000 THEN RAISE EXCEPTION 'budget exhausted'; END IF;
 INSERT INTO product.ai_months(month) VALUES(m) ON CONFLICT DO NOTHING;
 SELECT * INTO budget FROM product.ai_months WHERE month = m FOR UPDATE;
 SELECT coalesce(sum(reserved_micro_usd),0) INTO carry FROM product.ai_months WHERE month <> m;
 IF budget.spent_micro_usd + budget.reserved_micro_usd + carry + amount > budget.cap_micro_usd THEN RAISE EXCEPTION 'budget exhausted'; END IF;
 INSERT INTO product.ai_reservations VALUES(p_id,m,p_operation,p_attempt,p_plan,amount,NULL,'reserved',now());
 UPDATE product.ai_months SET reserved_micro_usd = reserved_micro_usd + amount WHERE month = m;
 RETURN amount;
END $$;

CREATE FUNCTION product.mark_ai(p_id uuid, p_state text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, product AS $$
DECLARE r product.ai_reservations;
BEGIN
 PERFORM pg_advisory_xact_lock(718443901);
 SELECT * INTO STRICT r FROM product.ai_reservations WHERE id = p_id FOR UPDATE;
 IF p_state = 'dispatched' AND r.state = 'reserved' THEN
   IF r.month <> date_trunc('month', clock_timestamp() AT TIME ZONE 'UTC')::date THEN RAISE EXCEPTION 'reserve again in current month'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r.plan) e LEFT JOIN product.ai_prices p ON p.id = e->>'price_id' WHERE p.id IS NULL OR p.effective_at > clock_timestamp() OR p.valid_until <= clock_timestamp()) THEN RAISE EXCEPTION 'pricing expired before dispatch'; END IF;
 ELSIF p_state = 'uncertain' AND r.state = 'dispatched' THEN NULL;
 ELSIF p_state = 'released' AND r.state = 'reserved' THEN
   UPDATE product.ai_months SET reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd WHERE month = r.month;
 ELSE RAISE EXCEPTION 'invalid reservation transition'; END IF;
 UPDATE product.ai_reservations SET state = p_state WHERE id = p_id;
END $$;

CREATE FUNCTION product.settle_ai(p_id uuid, p_usage jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, product AS $$
DECLARE r product.ai_reservations; item jsonb; rate bigint; amount bigint := 0;
BEGIN
 PERFORM pg_advisory_xact_lock(718443901);
 SELECT * INTO STRICT r FROM product.ai_reservations WHERE id = p_id FOR UPDATE;
 IF r.state NOT IN ('dispatched','uncertain') THEN RAISE EXCEPTION 'reservation not unsettled'; END IF;
 IF p_usage IS NULL OR jsonb_typeof(p_usage) <> 'array' OR jsonb_array_length(p_usage) <> jsonb_array_length(r.plan) OR
   (SELECT count(DISTINCT e->>'price_id') FROM jsonb_array_elements(p_usage) e) <> jsonb_array_length(p_usage) THEN RAISE EXCEPTION 'incomplete usage'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_usage) LOOP
   IF (item->>'units') IS NULL OR (item->>'units') !~ '^(0|[1-9][0-9]{0,12})$' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.plan) e WHERE e->>'price_id' = item->>'price_id') THEN RAISE EXCEPTION 'invalid usage'; END IF;
   SELECT micro_usd_per_million_units INTO STRICT rate FROM product.ai_prices WHERE id = item->>'price_id';
   amount := amount + ceil((item->>'units')::numeric * rate / 1000000)::bigint;
 END LOOP;
 UPDATE product.ai_months SET reserved_micro_usd = reserved_micro_usd - r.reserved_micro_usd, spent_micro_usd = spent_micro_usd + amount WHERE month = r.month;
 UPDATE product.ai_reservations SET state = 'settled', actual_micro_usd = amount WHERE id = p_id;
 RETURN amount;
END $$;
REVOKE ALL ON FUNCTION product.reserve_ai(uuid,uuid,integer,jsonb), product.mark_ai(uuid,text), product.settle_ai(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION product.reserve_ai(uuid,uuid,integer,jsonb), product.mark_ai(uuid,text), product.settle_ai(uuid,jsonb) TO noti_school_api;
