// Keep rejected legacy records for administrator audit without exposing them as customers.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, normalize } from "./import-seed.mjs";
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const { data: brands, error } = await db.from("brands").select("id,slug");
if (error) throw error;
for (const brand of brands) {
  const valid = new Set();
  for (const file of fs
    .readdirSync("data/raw")
    .filter((f) => f.startsWith(brand.slug + "-contacts"))
    .sort(
      (a, b) => Number(a.includes("delta")) - Number(b.includes("delta")),
    )) {
    for (const r of parseCsv(fs.readFileSync("data/raw/" + file, "utf8"))) {
      try {
        valid.add(normalize(r.value, "contacts", brand).row.external_id);
      } catch {}
    }
  }
  let rejected = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("contacts")
      .select("external_id")
      .eq("brand_id", brand.id)
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    rejected.push(
      ...data
        .filter((r) => !valid.has(r.external_id))
        .map((r) => r.external_id),
    );
    if (data.length < 1000) break;
  }
  for (let i = 0; i < rejected.length; i += 100) {
    const { error } = await db
      .from("contacts")
      .update({
        import_valid: false,
        status: "pending",
        consent_marketing: false,
      })
      .eq("brand_id", brand.id)
      .in("external_id", rejected.slice(i, i + 100));
    if (error) throw error;
  }
  console.log(
    brand.slug,
    "valid source identities",
    valid.size,
    "legacy rejected rows quarantined",
    rejected.length,
  );
}
