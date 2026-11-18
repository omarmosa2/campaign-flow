// Read-only schema metadata; never prints tokens, settings or row contents.
const response = await fetch(
  process.env.NEXT_PUBLIC_SUPABASE_URL + "/rest/v1/",
  {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
      Accept: "application/openapi+json",
    },
  },
);
const schema = await response.json();
for (const table of [
  "profiles",
  "orders",
  "payments",
  "attachments",
  "settings",
  "ad_requests",
])
  console.log(
    JSON.stringify({
      table,
      columns: Object.keys(schema.definitions?.[table]?.properties ?? {}),
      schemaStatus: response.status,
    }),
  );
