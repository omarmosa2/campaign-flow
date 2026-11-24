-- Additive transactional outbox. No backfill and no changes to historical data.
BEGIN;
CREATE TABLE public.whatsapp_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 enabled boolean, -- NULL inherits the server environment
 recipients text[], -- NULL inherits ADMIN_WHATSAPP_NUMBER
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(recipients IS NULL OR cardinality(recipients) BETWEEN 1 AND 5)
);
INSERT INTO public.whatsapp_settings(id) VALUES(true);
CREATE TABLE public.whatsapp_events (
 id uuid PRIMARY KEY,
 request_id uuid UNIQUE REFERENCES public.ad_requests(id),
 order_id uuid UNIQUE REFERENCES public.orders(id),
 snapshot jsonb NOT NULL,
 recipients text[], -- Frozen at commit for application submissions; legacy writes inherit at expansion.
 created_at timestamptz NOT NULL DEFAULT now(),
 expanded_at timestamptz,
 CHECK(num_nonnulls(request_id,order_id)=1)
);
CREATE TABLE public.whatsapp_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid REFERENCES public.whatsapp_events(id),
 recipient text NOT NULL CHECK(recipient ~ '^\+[1-9][0-9]{7,14}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','queued','sent','delivered','failed','uncertain')),
 external_id text,
 accepted_at timestamptz,
 attempts integer NOT NULL DEFAULT 0,
 retryable boolean NOT NULL DEFAULT false,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_attempt_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 last_checked_at timestamptz,
 lock_token uuid,
 UNIQUE(booking_id,recipient)
);
CREATE INDEX whatsapp_due ON public.whatsapp_notifications(status,next_attempt_at);
CREATE INDEX whatsapp_unexpanded ON public.whatsapp_events(created_at) WHERE expanded_at IS NULL;
CREATE INDEX whatsapp_external ON public.whatsapp_notifications(external_id) WHERE external_id IS NOT NULL;

CREATE FUNCTION public.enqueue_whatsapp_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_snapshot jsonb; v_recipients text[]; v_disabled boolean;
BEGIN
 SELECT coalesce(recipients,nullif(current_setting('campaign.whatsapp_recipients',true),'')::text[]),
  enabled IS FALSE OR coalesce(current_setting('campaign.whatsapp_enabled',true),'true')='false'
 INTO v_recipients,v_disabled FROM public.whatsapp_settings WHERE id;
 IF TG_TABLE_NAME='ad_requests' THEN
  v_snapshot := to_jsonb(NEW) || jsonb_build_object('payment_status',
    (SELECT payment_status FROM public.ad_request_receipts WHERE request_id=NEW.id));
  INSERT INTO public.whatsapp_events(id,request_id,snapshot,recipients,expanded_at)
   VALUES(NEW.id,NEW.id,v_snapshot,v_recipients,CASE WHEN v_disabled THEN now() END);
 ELSE
  -- Only fields actually present in the historical booking model; no access tokens/answers.
  v_snapshot := jsonb_build_object('id',NEW.id,'order_number',NEW.order_number,'customer_name',NEW.customer_name,
   'phone',NEW.phone,'item_name',NEW.item_name,'amount',NEW.amount,'currency',NEW.currency,
   'status',NEW.status,'payment_status',NEW.payment_status,'notes',NEW.notes,'created_at',NEW.created_at);
  INSERT INTO public.whatsapp_events(id,order_id,snapshot,recipients,expanded_at)
   VALUES(NEW.id,NEW.id,v_snapshot,v_recipients,CASE WHEN v_disabled THEN now() END);
 END IF;
 RETURN NEW;
END $$;
-- Deferred so receipt metadata is captured after the complete booking transaction.
CREATE CONSTRAINT TRIGGER whatsapp_new_request AFTER INSERT ON public.ad_requests
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_booking();
CREATE CONSTRAINT TRIGGER whatsapp_new_order AFTER INSERT ON public.orders
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.enqueue_whatsapp_booking();

-- Reuse all existing receipt validation/idempotency without copying the booking implementation.
-- Transaction-local context survives until the deferred trigger runs at commit (including poolers).
CREATE FUNCTION public.submit_ad_request_with_whatsapp(
 p_key uuid,p_placement text,p_age integer,p_interests text,p_objective text,p_source text,p_client text,
 p_path text,p_mime text,p_size integer,p_sha256 text,p_whatsapp_enabled boolean,p_whatsapp_recipients text[],p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_whatsapp_enabled IS NULL OR p_whatsapp_recipients IS NULL OR cardinality(p_whatsapp_recipients)>5
 OR (p_whatsapp_enabled AND cardinality(p_whatsapp_recipients)<1)
 OR EXISTS(SELECT 1 FROM unnest(p_whatsapp_recipients) r WHERE r IS NULL OR r !~ '^\+[1-9][0-9]{7,14}$') THEN RAISE EXCEPTION 'Invalid notification configuration'; END IF;
 PERFORM set_config('campaign.whatsapp_enabled',p_whatsapp_enabled::text,true);
 PERFORM set_config('campaign.whatsapp_recipients',p_whatsapp_recipients::text,true);
 RETURN public.submit_ad_request_with_receipt(p_key,p_placement,p_age,p_interests,p_objective,p_source,p_client,p_path,p_mime,p_size,p_sha256,p_actor);
END $$;

CREATE FUNCTION public.claim_ultramsg(p_enabled boolean,p_recipients text[],p_number text DEFAULT NULL)
RETURNS SETOF public.whatsapp_notifications LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_config public.whatsapp_settings; v_event public.whatsapp_events; v_recipients text[];
BEGIN
 SELECT * INTO v_config FROM public.whatsapp_settings WHERE id FOR SHARE;
 v_recipients := coalesce(v_config.recipients,p_recipients);
 IF cardinality(v_recipients) NOT BETWEEN 1 AND 5 OR v_recipients IS NULL
 OR EXISTS(SELECT 1 FROM unnest(v_recipients) r WHERE r IS NULL OR r !~ '^\+[1-9][0-9]{7,14}$') THEN
  RAISE EXCEPTION 'Invalid notification recipients';
 END IF;
 FOR v_event IN SELECT * FROM public.whatsapp_events
  WHERE expanded_at IS NULL AND (p_number IS NULL OR snapshot->>'order_number'=p_number)
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 30 LOOP
  IF p_enabled AND coalesce(v_config.enabled,true) THEN
   INSERT INTO public.whatsapp_notifications(booking_id,recipient)
    SELECT v_event.id,r FROM (SELECT DISTINCT unnest(coalesce(v_event.recipients,v_recipients)) r) t ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.whatsapp_events SET expanded_at=now() WHERE id=v_event.id;
 END LOOP;
 -- An expired lease may have sent externally. Never automatically send it again.
 UPDATE public.whatsapp_notifications SET status='uncertain',lock_token=NULL,retryable=false,
  last_error='انتهت مهلة المعالجة؛ راجع UltraMsg قبل إعادة الإرسال لتفادي التكرار'
  WHERE status='processing' AND last_attempt_at<now()-interval '5 minutes';
 IF NOT p_enabled OR NOT coalesce(v_config.enabled,true) THEN RETURN; END IF;
 RETURN QUERY WITH due AS (
  SELECT n.id FROM public.whatsapp_notifications n LEFT JOIN public.whatsapp_events e ON e.id=n.booking_id
  WHERE (n.status='pending' OR (n.status='failed' AND n.retryable AND n.attempts<4))
   AND n.next_attempt_at<=now() AND (p_number IS NULL OR e.snapshot->>'order_number'=p_number)
  ORDER BY n.created_at FOR UPDATE OF n SKIP LOCKED LIMIT 5
 ) UPDATE public.whatsapp_notifications n SET status='processing',attempts=n.attempts+1,
  last_attempt_at=now(),lock_token=gen_random_uuid() FROM due WHERE n.id=due.id RETURNING n.*;
END $$;

CREATE FUNCTION public.finish_ultramsg(p_id uuid,p_lock uuid,p_status text,p_external text,p_error text,p_retry boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('queued','failed','uncertain') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 UPDATE public.whatsapp_notifications SET status=p_status,external_id=p_external,last_error=p_error,
  accepted_at=CASE WHEN p_status='queued' THEN coalesce(accepted_at,now()) ELSE accepted_at END,
  retryable=p_retry AND p_status='failed',lock_token=NULL,
  next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,greatest(0,attempts-1)))::integer)
 WHERE id=p_id AND lock_token=p_lock AND status='processing';
 IF NOT FOUND THEN RAISE EXCEPTION 'Notification lease lost'; END IF;
END $$;

CREATE FUNCTION public.retry_ultramsg(p_id uuid,p_actor uuid,p_ack boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND enabled AND role IN ('admin','super_admin')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF p_ack IS DISTINCT FROM true THEN RAISE EXCEPTION 'يجب تأكيد احتمال تكرار الرسالة'; END IF;
 INSERT INTO public.audit_logs(actor,action,metadata)
  SELECT p_actor,'ultramsg_retry',jsonb_build_object('notification_id',id,'previous_external_id',external_id,'attempts',attempts)
  FROM public.whatsapp_notifications WHERE id=p_id AND status IN ('failed','uncertain') FOR UPDATE;
 UPDATE public.whatsapp_notifications SET status='pending',retryable=false,next_attempt_at=now(),last_error=NULL,external_id=NULL,sent_at=NULL
 WHERE id=p_id AND status IN ('failed','uncertain');
 IF NOT FOUND THEN RAISE EXCEPTION 'لا يمكن إعادة إرسال هذا الإشعار'; END IF;
END $$;

CREATE FUNCTION public.record_ultramsg_status(p_id uuid,p_external text,p_status text,p_sent_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('queued','sent','delivered','failed') THEN RAISE EXCEPTION 'Invalid provider status'; END IF;
 UPDATE public.whatsapp_notifications SET status=p_status,retryable=false,
  sent_at=CASE WHEN p_status IN ('sent','delivered') THEN coalesce(sent_at,p_sent_at,now()) ELSE sent_at END,
  last_error=CASE WHEN p_status='failed' THEN 'أبلغ UltraMsg عن فشل الرسالة؛ راجع المزود قبل إعادة الإرسال' ELSE NULL END
 WHERE id=p_id AND external_id=p_external AND status IN ('queued','sent')
  AND NOT(status='sent' AND p_status='queued');
END $$;

CREATE FUNCTION public.save_ultramsg_settings(p_enabled boolean,p_recipients text[],p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND enabled AND role IN ('admin','super_admin')) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
 IF p_enabled IS NULL OR cardinality(p_recipients) NOT BETWEEN 1 AND 5 OR p_recipients IS NULL
 OR EXISTS(SELECT 1 FROM unnest(p_recipients) r WHERE r IS NULL OR r !~ '^\+[1-9][0-9]{7,14}$') THEN RAISE EXCEPTION 'رقم غير صالح'; END IF;
 UPDATE public.whatsapp_settings SET enabled=p_enabled,recipients=p_recipients,updated_at=now() WHERE id;
 -- Disabled bookings never get replayed when enabled again.
 IF NOT p_enabled THEN UPDATE public.whatsapp_events SET expanded_at=now() WHERE expanded_at IS NULL; END IF;
 INSERT INTO public.audit_logs(actor,action) VALUES(p_actor,'ultramsg_settings_updated');
END $$;

CREATE FUNCTION public.ultramsg_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('accepted',count(*) FILTER(WHERE accepted_at IS NOT NULL),
  'queued',count(*) FILTER(WHERE status='queued'),'sent',count(*) FILTER(WHERE status IN ('sent','delivered')),
  'delivered',count(*) FILTER(WHERE status='delivered'),'failed',count(*) FILTER(WHERE status='failed'),
  'uncertain',count(*) FILTER(WHERE status='uncertain'),'last_sent_at',max(sent_at)) FROM public.whatsapp_notifications
$$;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_settings,public.whatsapp_events,public.whatsapp_notifications FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.whatsapp_settings,public.whatsapp_events,public.whatsapp_notifications TO service_role;
GRANT SELECT ON public.whatsapp_settings,public.whatsapp_events,public.whatsapp_notifications TO authenticated;
CREATE POLICY whatsapp_admin_settings ON public.whatsapp_settings FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY whatsapp_admin_events ON public.whatsapp_events FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY whatsapp_admin_log ON public.whatsapp_notifications FOR SELECT TO authenticated USING(public.is_admin());
REVOKE ALL ON FUNCTION public.enqueue_whatsapp_booking(),public.claim_ultramsg(boolean,text[],text),public.finish_ultramsg(uuid,uuid,text,text,text,boolean),public.retry_ultramsg(uuid,uuid,boolean),public.save_ultramsg_settings(boolean,text[],uuid),public.ultramsg_stats(),public.record_ultramsg_status(uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ultramsg(boolean,text[],text),public.finish_ultramsg(uuid,uuid,text,text,text,boolean),public.retry_ultramsg(uuid,uuid,boolean),public.save_ultramsg_settings(boolean,text[],uuid),public.ultramsg_stats(),public.record_ultramsg_status(uuid,text,text,timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.submit_ad_request_with_whatsapp(uuid,text,integer,text,text,text,text,text,text,integer,text,boolean,text[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_ad_request_with_whatsapp(uuid,text,integer,text,text,text,text,text,text,integer,text,boolean,text[],uuid) TO service_role;
COMMIT;
