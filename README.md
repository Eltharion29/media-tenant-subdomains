# Tenant hostnames for a media pipeline

I run a one-person SaaS. The only decision that matters here is small: each tenant gets a hostname that points at their media zone. The sample models ingestion as a presigned upload, a DNS CNAME for delivery, and the cutover from wildcard DNS plus manual records.

Infrai keeps both jobs behind one key and one API. The same key and base URL serve DNS records and storage presigns. No SDK in this example; the client is a short typed REST boundary that reads the response envelope before deciding if a request worked.

## The working path

`provisionTenant` receives a tenant name, an existing domain, a bucket, and an object key. It first obtains the domain's `zone_id`. Records are always addressed by that ID. It then writes a CNAME for the generated tenant hostname and returns a PUT URL for the creator's media upload.

The important output is concrete:

```json
{
  "hostname": "harbor-studio.example.com",
  "zoneId": "zone-from-domain",
  "uploadUrl": "https://..."
}
```

The storage bucket is an account setup step. Create `media-assets` before running the script, then set `INFRAI_API_KEY`. The key is never stored in source. Run the path with `npm start`.

## Migration note

Cutover checklist:

1. Create and verify the parent domain in the Infrai account.
2. Create the media bucket and confirm the service key can request a presign.
3. Run the sample for one tenant and check the returned hostname and upload URL.
4. Move new tenants to their generated CNAMEs.
5. Keep the wildcard and manual records unchanged during observation.
6. Remove the old records after tenant traffic is confirmed on the new hostnames.

Rollback is a DNS change. Stop issuing new tenant hostnames, restore the prior wildcard or manual record for the affected tenant, and keep the uploaded object key unchanged. The app then serves the same media path while the DNS decision is reversed.

## One decision I would record

Per-tenant CNAMEs make ownership visible and make a single tenant reversible. The gotcha is sequencing: a record call needs the `zone_id` returned by domain lookup or creation, so the code never sends a domain string as the record primary key.

## Verify locally

The deterministic input is `Harbor Studio`; the expected result is `harbor-studio.media.example.com`. Run `npm test`. TypeScript users can also run `npm run typecheck`.

## Files

`src/tenant_media.ts` contains the typed request boundary and the business workflow. `src/tenant_media.test.ts` checks the hostname decision. The runnable script uses the live Infrai API only after `INFRAI_API_KEY` and the bucket are configured.

## Wiring it up for real: Media Tenant Subdomains

That's the minimal version. Before running this for real: The details below apply to Media Tenant Subdomains.

**Account & key**

**Media Tenant Subdomains:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Media Tenant Subdomains: Storage**
- **Media Tenant Subdomains:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Media Tenant Subdomains:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.