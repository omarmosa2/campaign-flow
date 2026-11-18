-- Test-only approximation of Storage's metadata tables. Production metadata is written by Storage APIs.
CREATE TABLE storage.objects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 bucket_id text NOT NULL REFERENCES storage.buckets(id),
 name text NOT NULL,
 metadata jsonb,
 user_metadata jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(bucket_id,name)
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
GRANT ALL ON storage.objects,storage.buckets TO anon,authenticated,service_role;
-- Deliberately broad old policies: the migration must still isolate its dedicated bucket.
CREATE POLICY existing_broad_objects ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
CREATE POLICY existing_broad_buckets ON storage.buckets FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
