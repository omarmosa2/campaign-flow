-- Not yet deployed. Additive upgrade; never rewrites historical requests/payments/profiles.
BEGIN;
CREATE TABLE public.ad_request_receipts (
 request_id uuid PRIMARY KEY REFERENCES public.ad_requests(id),
 path text NOT NULL UNIQUE CHECK(path ~ '^request-receipts/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
 storage_object_id uuid NOT NULL UNIQUE,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')),
 size integer NOT NULL CHECK(size > 0 AND size <= 4194304),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 payment_status text NOT NULL DEFAULT 'review' CHECK(payment_status IN ('review','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_request_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_request_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ad_request_receipts TO service_role,authenticated;
CREATE POLICY admin_receipt_read ON public.ad_request_receipts FOR SELECT TO authenticated USING(public.is_admin());

-- A pre-existing bucket is made private and given the exact new limits; objects are preserved.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('request-receipts','request-receipts',false,4194304,ARRAY['image/png','image/jpeg','image/webp'])
 ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=4194304,
 allowed_mime_types=ARRAY['image/png','image/jpeg','image/webp'];
-- Restrictive policies also defeat pre-existing broad permissive policies. Only server
-- service_role may use this bucket, including signing. Other buckets are unaffected.
CREATE POLICY request_receipts_server_only ON storage.objects AS RESTRICTIVE FOR ALL
 TO anon,authenticated USING(bucket_id <> 'request-receipts') WITH CHECK(bucket_id <> 'request-receipts');
CREATE POLICY request_receipts_bucket_server_only ON storage.buckets AS RESTRICTIVE FOR ALL
 TO anon,authenticated USING(id <> 'request-receipts') WITH CHECK(id <> 'request-receipts');

-- Keep old deployments working until the explicit, post-deployment activation below.
CREATE TABLE public.request_receipt_rollout (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 required boolean NOT NULL DEFAULT false
);
INSERT INTO public.request_receipt_rollout(singleton) VALUES(true);
ALTER TABLE public.request_receipt_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_receipt_rollout FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.request_receipt_rollout TO service_role;

CREATE FUNCTION public.check_ad_request_receipt() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (SELECT required FROM public.request_receipt_rollout WHERE singleton)
 AND NOT EXISTS(SELECT 1 FROM public.ad_request_receipts WHERE request_id=NEW.id) THEN
  RAISE EXCEPTION 'إشعار الدفع إلزامي لإتمام الطلب' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.check_ad_request_receipt() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER ad_request_requires_receipt AFTER INSERT ON public.ad_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_ad_request_receipt();

CREATE FUNCTION public.submit_ad_request_with_receipt(
 p_key uuid,p_placement text,p_age integer,p_interests text,p_objective text,p_source text,p_client text,
 p_path text,p_mime text,p_size integer,p_sha256 text,p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_existing public.ad_request_keys;
 v_result public.ad_requests;
 v_receipt public.ad_request_receipts;
 v_object storage.objects;
 v_fingerprint text;
 v_ext text;
BEGIN
 IF p_key IS NULL OR p_source IS NULL OR p_source NOT IN ('public','admin')
 OR p_client IS NULL OR length(p_client) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'بيانات إرسال غير صالحة'; END IF;
 IF (p_source='public' AND p_actor IS NOT NULL) OR
 (p_source='admin' AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND enabled AND role IN ('admin','super_admin'))) THEN
  RAISE EXCEPTION 'غير مصرح';
 END IF;
 IF p_placement IS NULL OR length(btrim(p_placement)) NOT BETWEEN 1 AND 200
 OR p_age IS NULL OR p_age <= 0 OR p_interests IS NULL OR length(btrim(p_interests)) NOT BETWEEN 1 AND 5000
 OR p_objective IS NULL OR p_objective NOT IN ('رسائل واتصال هاتفي','مشاهدات','متابعين') THEN
  RAISE EXCEPTION 'بيانات الحملة غير صالحة';
 END IF;
 IF p_path IS NULL OR p_mime IS NULL OR p_mime NOT IN ('image/png','image/jpeg','image/webp')
 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 4194304
 OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'الإشعار غير صالح'; END IF;
 v_ext := CASE p_mime WHEN 'image/png' THEN 'png' WHEN 'image/jpeg' THEN 'jpg' ELSE 'webp' END;
 IF p_path !~ ('^request-receipts/' || p_key::text || '/[0-9a-f-]{36}\.' || v_ext || '$') THEN
  RAISE EXCEPTION 'الإشعار لا يتبع معرّف الإرسال';
 END IF;
 -- SHA-256 of canonical data, not a time window. Fixed size also fits the existing btree index.
 -- A roaming public client's IP may change; the secret UUID plus identical content identifies a retry.
 v_fingerprint := encode(sha256(convert_to(jsonb_build_array(btrim(p_placement),p_age,btrim(p_interests),p_objective,p_source,p_actor,p_sha256,p_mime,p_size)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 SELECT * INTO v_existing FROM public.ad_request_keys WHERE key=p_key;
 IF v_existing.key IS NOT NULL THEN
  IF v_existing.fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'معرّف الطلب مستخدم لبيانات أو إشعار آخر'; END IF;
  SELECT * INTO STRICT v_result FROM public.ad_requests WHERE id=v_existing.request_id;
  SELECT * INTO STRICT v_receipt FROM public.ad_request_receipts WHERE request_id=v_result.id;
  -- A retry never replaces or relinks the first successful receipt. Check its stored object too.
  SELECT * INTO v_object FROM storage.objects WHERE bucket_id='request-receipts' AND name=v_receipt.path FOR UPDATE;
  IF v_object.id IS NULL OR v_object.id<>v_receipt.storage_object_id
   OR v_object.metadata->>'size' IS DISTINCT FROM v_receipt.size::text
   OR v_object.metadata->>'mimetype' IS DISTINCT FROM v_receipt.mime
   OR v_object.user_metadata->>'sha256' IS DISTINCT FROM v_receipt.sha256
   OR v_object.user_metadata->>'submission_key' IS DISTINCT FROM p_key::text THEN
   RAISE EXCEPTION 'تعذر التحقق من إشعار الطلب المحفوظ';
  END IF;
 ELSE
  -- Storage metadata is written by Storage, not by this RPC. No direct storage writes here.
  -- The server also downloads and hashes the actual object before invoking this function.
  SELECT * INTO v_object FROM storage.objects WHERE bucket_id='request-receipts' AND name=p_path FOR UPDATE;
  IF v_object.id IS NULL OR v_object.created_at < clock_timestamp()-interval '1 hour'
   OR v_object.metadata->>'size' IS DISTINCT FROM p_size::text
   OR v_object.metadata->>'mimetype' IS DISTINCT FROM p_mime
   OR v_object.user_metadata->>'sha256' IS DISTINCT FROM p_sha256
   OR v_object.user_metadata->>'submission_key' IS DISTINCT FROM p_key::text THEN
   RAISE EXCEPTION 'ملف الإشعار مفقود أو خصائصه غير مطابقة';
  END IF;
  INSERT INTO public.ad_requests(ad_placement,age_group,audience_interests,campaign_objective,source)
   VALUES(btrim(p_placement),p_age,btrim(p_interests),p_objective,p_source) RETURNING * INTO v_result;
  INSERT INTO public.ad_request_receipts(request_id,path,storage_object_id,mime,size,sha256)
   VALUES(v_result.id,p_path,v_object.id,p_mime,p_size,p_sha256) RETURNING * INTO v_receipt;
  INSERT INTO public.ad_request_keys(key,request_id,fingerprint,client_hash)
   VALUES(p_key,v_result.id,v_fingerprint,p_client);
 END IF;
 RETURN jsonb_build_object('order_number',v_result.order_number,'receipt_path',v_receipt.path);
END $$;
REVOKE ALL ON FUNCTION public.submit_ad_request_with_receipt(uuid,text,integer,text,text,text,text,text,text,integer,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_request_with_receipt(uuid,text,integer,text,text,text,text,text,text,integer,text,uuid) TO service_role;

-- Run manually ONLY AFTER the new application is deployed and smoke-tested.
-- Not called by this migration. Lock waits for old writes and prevents a cutover race.
CREATE FUNCTION public.activate_request_receipt_requirement() RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 LOCK TABLE public.ad_requests IN SHARE ROW EXCLUSIVE MODE;
 UPDATE public.request_receipt_rollout SET required=true WHERE singleton;
 REVOKE EXECUTE ON FUNCTION public.submit_ad_request(uuid,text,integer,text,text,text,text,uuid) FROM service_role;
END $$;
REVOKE ALL ON FUNCTION public.activate_request_receipt_requirement() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.activate_request_receipt_requirement() TO service_role;
COMMIT;
