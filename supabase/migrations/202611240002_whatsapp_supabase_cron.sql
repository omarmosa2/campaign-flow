-- Optional hosted Supabase scheduler. Direct booking sends do not depend on it.
-- Additive: never changes bookings, notification deduplication, or other cron jobs.
BEGIN;

DO $extensions$
BEGIN
 IF (SELECT count(*) FROM pg_available_extensions WHERE name IN ('pg_cron','pg_net','supabase_vault'))=3 THEN
  BEGIN
   CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
   CREATE SCHEMA IF NOT EXISTS extensions;
   CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
   CREATE EXTENSION IF NOT EXISTS supabase_vault;
  EXCEPTION WHEN OTHERS THEN
   -- Hosted settings/permissions can prohibit installing extensions. Never stop bookings.
   RAISE NOTICE 'Optional WhatsApp scheduler extensions could not be enabled; check Supabase Integrations.';
  END;
 ELSE
  RAISE NOTICE 'Optional Supabase Cron extensions are unavailable; direct sends and manual retries remain active.';
 END IF;
END $extensions$;

CREATE OR REPLACE FUNCTION public.whatsapp_cron_available()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT count(*) FROM pg_catalog.pg_extension
  WHERE extname IN ('pg_cron','pg_net','supabase_vault'))=3
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_cron_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_active boolean := false; v_schedule text;
BEGIN
 IF NOT public.whatsapp_cron_available() THEN
  RETURN jsonb_build_object('available',false,'enabled',false,'schedule',null);
 END IF;
 EXECUTE 'SELECT active,schedule FROM cron.job WHERE jobname=$1 AND username=current_user'
  INTO v_active,v_schedule USING 'campaign-flow-whatsapp-retry';
 RETURN jsonb_build_object('available',true,'enabled',coalesce(v_active,false),'schedule',v_schedule);
END $$;

CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_retry()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_url text; v_secret text; v_request bigint;
BEGIN
 IF NOT public.whatsapp_cron_available() THEN RETURN NULL; END IF;
 -- Idle databases make no HTTP calls. An expired lease is audited as uncertain by the worker.
 IF NOT EXISTS(SELECT 1 FROM public.whatsapp_events WHERE expanded_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM public.whatsapp_notifications WHERE
  (status='pending' AND next_attempt_at<=now()) OR
  (status='failed' AND retryable AND attempts<4 AND next_attempt_at<=now()) OR
  (status='processing' AND last_attempt_at<now()-interval '5 minutes') OR
  (status IN ('queued','sent') AND external_id IS NOT NULL)) THEN RETURN NULL; END IF;
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1'
  INTO v_url USING 'campaign_flow_whatsapp_app_url';
 EXECUTE 'SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name=$1'
  INTO v_secret USING 'campaign_flow_whatsapp_cron_secret';
 IF v_url IS NULL OR v_secret IS NULL THEN RAISE EXCEPTION 'WhatsApp scheduler configuration missing'; END IF;
 -- Secrets live in Vault, never in cron.job.command, the URL, or returned payloads.
 BEGIN
  EXECUTE 'SELECT net.http_get(url:=$1,headers:=$2,timeout_milliseconds:=55000)'
   INTO v_request USING v_url||'/api/cron/whatsapp',
    jsonb_build_object('Authorization','Bearer '||v_secret);
 EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'WhatsApp scheduler HTTP dispatch failed' USING ERRCODE='P0001';
 END;
 RETURN v_request;
END $$;

CREATE OR REPLACE FUNCTION public.configure_whatsapp_cron(p_app_url text,p_secret text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_url text;
BEGIN
 IF NOT public.whatsapp_cron_available() THEN RETURN public.whatsapp_cron_status(); END IF;
 IF p_app_url IS NULL OR p_app_url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:443)?/?$'
 OR p_app_url ~* '^https://(localhost|127[.])'
 OR p_secret IS NULL OR length(p_secret) NOT BETWEEN 32 AND 512 OR p_secret ~ '[\r\n]' THEN
  RAISE EXCEPTION 'Invalid WhatsApp scheduler configuration';
 END IF;
 v_url := rtrim(p_app_url,'/');
 PERFORM pg_advisory_xact_lock(hashtextextended('campaign-flow-whatsapp-retry',0));
 BEGIN
  EXECUTE 'SELECT id FROM vault.secrets WHERE name=$1' INTO v_id USING 'campaign_flow_whatsapp_app_url';
  IF v_id IS NULL THEN
   EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_id
    USING v_url,'campaign_flow_whatsapp_app_url','Production origin for the booking notification worker';
  ELSE
   EXECUTE 'SELECT vault.update_secret($1,$2,$3,$4)'
    USING v_id,v_url,'campaign_flow_whatsapp_app_url','Production origin for the booking notification worker';
  END IF;
  v_id := NULL;
  EXECUTE 'SELECT id FROM vault.secrets WHERE name=$1' INTO v_id USING 'campaign_flow_whatsapp_cron_secret';
  IF v_id IS NULL THEN
   EXECUTE 'SELECT vault.create_secret($1,$2,$3)' INTO v_id
    USING p_secret,'campaign_flow_whatsapp_cron_secret','Server-only authorization for the booking notification worker';
  ELSE
   EXECUTE 'SELECT vault.update_secret($1,$2,$3,$4)'
    USING v_id,p_secret,'campaign_flow_whatsapp_cron_secret','Server-only authorization for the booking notification worker';
  END IF;
  -- The same job name updates only this scheduler and never creates duplicates.
  EXECUTE 'SELECT cron.schedule($1,$2,$3)'
   USING 'campaign-flow-whatsapp-retry','* * * * *','SELECT public.dispatch_whatsapp_retry();';
 EXCEPTION WHEN OTHERS THEN
  -- Do not echo a Vault/SQL error that could contain parameter values.
  RAISE EXCEPTION 'Unable to configure optional WhatsApp scheduler' USING ERRCODE='P0001';
 END;
 RETURN public.whatsapp_cron_status();
END $$;

CREATE OR REPLACE FUNCTION public.disable_whatsapp_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job bigint;
BEGIN
 IF NOT public.whatsapp_cron_available() THEN RETURN; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('campaign-flow-whatsapp-retry',0));
 EXECUTE 'SELECT jobid FROM cron.job WHERE jobname=$1 AND username=current_user' INTO v_job USING 'campaign-flow-whatsapp-retry';
 IF v_job IS NOT NULL THEN EXECUTE 'SELECT cron.unschedule($1)' USING v_job; END IF;
END $$;

REVOKE ALL ON FUNCTION public.whatsapp_cron_available(),public.whatsapp_cron_status(),
 public.dispatch_whatsapp_retry(),public.configure_whatsapp_cron(text,text),public.disable_whatsapp_cron()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.whatsapp_cron_status(),public.configure_whatsapp_cron(text,text),
 public.disable_whatsapp_cron() TO service_role;
-- The owner running pg_cron can execute dispatch; application clients cannot.
COMMIT;
