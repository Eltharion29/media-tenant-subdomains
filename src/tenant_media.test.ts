import test from "node:test";
import assert from "node:assert/strict";
import { tenantHostname } from "./tenant_media.ts";

test("tenant names become stable hostnames for delivery", () => {
  assert.equal(tenantHostname("Harbor Studio", "media.example.com"), "harbor-studio.media.example.com");
});
