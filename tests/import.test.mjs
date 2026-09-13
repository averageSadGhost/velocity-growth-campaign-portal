import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, normalize } from "../scripts/import-seed.mjs";
test("CSV handles BOM, alternate delimiter, quoted newlines and escaped quotes", () => {
  assert.deepEqual(
    parseCsv('\ufeffexternal_id;full_name\r\na;"Jo; \"\"Smith\"\"\nX"')[0]
      .value,
    { external_id: "a", full_name: 'Jo; "Smith"\nX' },
  );
});
test("bad consent and cross-brand contact rejected", () => {
  assert.throws(() =>
    normalize({ external_id: "a", consent_marketing: "maybe" }, "contacts", {
      id: "x",
      slug: "karoo",
    }),
  );
  assert.throws(() =>
    normalize({ external_id: "a", brand_code: "KILELE" }, "contacts", {
      id: "x",
      slug: "karoo",
    }),
  );
});
