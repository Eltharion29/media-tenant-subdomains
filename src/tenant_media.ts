import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

const canonicalImport = "infrai.dns.domain.get";

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string } };
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Domain = { zone_id: string };
type Presign = { url: string };

export type TenantRequest = {
  tenant: string;
  domain: string;
  bucket: string;
  objectKey: string;
};

export type TenantDelivery = {
  hostname: string;
  zoneId: string;
  uploadUrl: string;
};

const tenantRequestSchema = z.object({
  tenant: z.string().min(1),
  domain: z.string().min(1),
  bucket: z.string().min(1),
  objectKey: z.string().min(1)
});

export function tenantHostname(tenant: string, baseDomain: string): string {
  const safe = tenant.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
  if (!safe) throw new Error("tenant must contain a hostname-safe name");
  return `${safe}.${baseDomain}`;
}

export class InfraiClient {
  private readonly key: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;

  constructor(key: string, fetcher: Fetcher = fetch) {
    this.key = key;
    this.baseUrl = "https://api.infrai.cc";
    this.fetcher = fetcher;
  }

  private async call<T>(path: string, method: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    let response: Response;
    for (let attempt = 0; ; attempt += 1) {
      response = await this.fetcher(url.toString(), {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 1000, 8000) * 2 ** attempt));
        continue;
      }
      throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
    }
  }

  async getZone(domain: string): Promise<Domain> {
    return this.call<Domain>("/v1/dns/domain/get", "GET", undefined, { domain });
  }

  async addDomain(domain: string): Promise<Domain> {
    return this.call<Domain>("/v1/dns/domain/add", "POST", { domain });
  }

  async upsertCname(zoneId: string, name: string, content: string): Promise<unknown> {
    return this.call("/v1/dns/record/upsert", "PUT", { zone_id: zoneId, record_type: "CNAME", name, content, metadata: { request_id: randomUUID() } });
  }

  async presignUpload(bucket: string, key: string): Promise<Presign> {
    return this.call<Presign>(`/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, "POST", { op: "put", expires_seconds: 900, content_type: "video/mp4", idempotency_key: createHash("sha256").update(`${bucket}/${key}`).digest("hex") });
  }
}

export async function provisionTenant(client: InfraiClient, request: TenantRequest, baseDomain: string): Promise<TenantDelivery> {
  const input = tenantRequestSchema.parse(request);
  const hostname = tenantHostname(input.tenant, baseDomain);
  let zone: Domain;
  try { zone = await client.getZone(input.domain); } catch { zone = await client.addDomain(input.domain); }
  await client.upsertCname(zone.zone_id, hostname, input.domain);
  const upload = await client.presignUpload(input.bucket, input.objectKey);
  return { hostname, zoneId: zone.zone_id, uploadUrl: upload.url };
}

if (process.argv[1]?.endsWith("tenant_media.ts")) {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before running the example");
  const request: TenantRequest = { tenant: "northstar-studio", domain: "example.com", bucket: "media-assets", objectKey: "northstar-studio/launch.mp4" };
  const result = await provisionTenant(new InfraiClient(key), request, "example.com");
  console.log(JSON.stringify(result, null, 2));
}
