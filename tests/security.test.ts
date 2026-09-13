import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordHash, passwordMatches, uuid } from "../lib/security.ts";
import { normalizeEvent } from "../lib/provider.ts";
test("password hashes are salted and reject incorrect passwords", () => {
  const a = passwordHash("test-report-password"),
    b = passwordHash("test-report-password");
  assert.notEqual(a, b);
  assert.ok(passwordMatches("test-report-password", a));
  assert.equal(passwordMatches("wrong", a), false);
  assert.equal(passwordMatches("x", "invalid"), false);
});
test("provider aliases normalize and malformed events fail closed", () => {
  assert.equal(
    normalizeEvent({
      event_id: "x",
      external_contact_id: "c",
      event_type: "bounce",
      occurred_at_utc: "2026-09-13T00:00:00Z",
    }).kind,
    "bounced",
  );
  assert.throws(() => normalizeEvent({ event_id: "x", event_type: "opened" }));
  assert.throws(() =>
    normalizeEvent({
      event_id: "x",
      external_contact_id: "c",
      event_type: "unknown",
      occurred_at_utc: "2026-09-13",
    }),
  );
});
test("IDs cannot smuggle arbitrary filter expressions", () => {
  assert.equal(uuid("x,brand_id.eq.y"), false);
  assert.equal(uuid("00000000-0000-0000-0000-000000000001"), true);
});
