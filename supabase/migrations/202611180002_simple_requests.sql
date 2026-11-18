-- Additive migration. Never modifies historical orders, payments, profiles or storage.
BEGIN;
CREATE SEQUENCE public.ad_request_numbers;
REVOKE ALL ON SEQUENCE public.ad_request_numbers FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SEQUENCE public.ad_request_numbers TO service_role;
CREATE TABLE public.ad_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_number text NOT NULL UNIQUE DEFAULT ('REQ-' || nextval('public.ad_request_numbers')::text),
 ad_placement text NOT NULL CHECK(length(btrim(ad_placement)) BETWEEN 1 AND 200),
 age_group integer NOT NULL CHECK(age_group > 0),
 audience_interests text NOT NULL CHECK(length(btrim(audience_interests)) BETWEEN 1 AND 5000),
 campaign_objective text NOT NULL CHECK(campaign_objective IN ('رسائل واتصال هاتفي','مشاهدات','متابعين')),
 source text NOT NULL CHECK(source IN ('public','admin')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_requests_created ON public.ad_requests(created_at DESC, id DESC);
CREATE TABLE public.ad_request_keys (
 key uuid PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES public.ad_requests(id),
 fingerprint text NOT NULL,
 client_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ad_request_dedupe ON public.ad_request_keys(client_hash, fingerprint, created_at DESC);
ALTER TABLE public.ad_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_requests, public.ad_request_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ad_requests TO authenticated;
CREATE POLICY admin_request_read ON public.ad_requests FOR SELECT TO authenticated USING(public.is_admin());
GRANT ALL ON public.ad_requests, public.ad_request_keys TO service_role;

CREATE FUNCTION public.submit_ad_request(p_key uuid,p_placement text,p_age integer,p_interests text,p_objective text,p_source text,p_client text,p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing ad_request_keys; result ad_requests; v_fingerprint text;
BEGIN
 IF p_source NOT IN ('public','admin') OR p_source IS NULL THEN RAISE EXCEPTION 'مصدر غير صالح'; END IF;
 IF p_source='admin' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_actor AND enabled AND role IN ('admin','super_admin')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 v_fingerprint := md5(jsonb_build_array(btrim(p_placement),p_age,btrim(p_interests),p_objective,p_source,p_actor)::text);
 -- Consistent lock order serializes both retries and identical concurrent submissions.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_client||v_fingerprint,1));
 SELECT * INTO existing FROM ad_request_keys WHERE key=p_key;
 IF existing.key IS NOT NULL THEN
  IF existing.fingerprint<>v_fingerprint OR existing.client_hash<>p_client THEN RAISE EXCEPTION 'معرّف الطلب مستخدم لبيانات أخرى'; END IF;
  SELECT * INTO result FROM ad_requests WHERE id=existing.request_id;
 ELSE
  SELECT r.* INTO result FROM ad_requests r JOIN ad_request_keys k ON k.request_id=r.id
   WHERE k.client_hash=p_client AND k.fingerprint=v_fingerprint AND k.created_at>now()-interval '1 minute' ORDER BY k.created_at DESC LIMIT 1;
  IF result.id IS NULL THEN
   INSERT INTO ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source)
    VALUES(btrim(p_placement),p_age,btrim(p_interests),p_objective,p_source) RETURNING * INTO result;
  END IF;
  INSERT INTO ad_request_keys(key,request_id,fingerprint,client_hash) VALUES(p_key,result.id,v_fingerprint,p_client);
 END IF;
 RETURN jsonb_build_object('order_number',result.order_number);
END $$;

-- Internal view combines historical records without inventing the four new fields.
CREATE VIEW public.all_ad_requests WITH (security_invoker=true) AS
 SELECT id,order_number,ad_placement,age_group,audience_interests,campaign_objective,source,created_at FROM ad_requests
 UNION ALL SELECT id,order_number,NULL::text,NULL::integer,NULL::text,NULL::text,'legacy'::text,created_at FROM orders;
REVOKE ALL ON public.all_ad_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.all_ad_requests TO service_role;
CREATE FUNCTION public.request_timezone() RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT COALESCE((SELECT value->>'timezone' FROM settings WHERE id='main'),'Asia/Damascus')
$$;
CREATE FUNCTION public.ad_request_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('total',count(*),'today',count(*) FILTER(WHERE created_at >= (date_trunc('day',now() AT TIME ZONE request_timezone()) AT TIME ZONE request_timezone()) AND created_at < ((date_trunc('day',now() AT TIME ZONE request_timezone())+interval '1 day') AT TIME ZONE request_timezone()))) FROM all_ad_requests
$$;
CREATE FUNCTION public.list_ad_requests(p_search text DEFAULT '',p_page integer DEFAULT 1) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH filtered AS (SELECT * FROM all_ad_requests WHERE p_search='' OR position(lower(p_search) IN lower(concat_ws(' ',order_number,ad_placement,age_group,audience_interests,campaign_objective)))>0),
 paged AS (SELECT * FROM filtered ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET (greatest(1,least(p_page,1000000))-1)*20)
 SELECT jsonb_build_object('rows',COALESCE((SELECT jsonb_agg(paged) FROM paged),'[]'::jsonb),'total',(SELECT count(*) FROM filtered),'timezone',request_timezone())
$$;
REVOKE ALL ON FUNCTION public.submit_ad_request(uuid,text,integer,text,text,text,text,uuid),public.request_timezone(),public.ad_request_stats(),public.list_ad_requests(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_request(uuid,text,integer,text,text,text,text,uuid),public.request_timezone(),public.ad_request_stats(),public.list_ad_requests(text,integer) TO service_role;
COMMIT;
