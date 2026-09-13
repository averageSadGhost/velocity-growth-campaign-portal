import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const delimiter = text.slice(0, text.indexOf("\n")).includes(";") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unterminated quoted field");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows
    .shift()
    .map((h) => h.trim().toLowerCase().replaceAll(" ", "_"));
  return rows.map((values, i) => ({
    line: i + 2,
    value:
      values.length === headers.length
        ? Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]))
        : null,
  }));
}
const blank = (v) =>
  !v || ["none", "null", "n/a", "nan"].includes(v.toLowerCase());
function date(v, name, warnings) {
  if (blank(v)) return null;
  const time = Date.parse(v);
  if (!Number.isFinite(time)) {
    warnings.push(`Invalid ${name}; stored as unknown`);
    return null;
  }
  return new Date(time).toISOString();
}
function consent(v) {
  const s = (v ?? "").toLowerCase();
  if (["true", "t", "yes", "1"].includes(s)) return true;
  if (["false", "f", "no", "0", ""].includes(s)) return false;
  throw new Error("Unrecognized marketing consent");
}
export function normalize(r, kind, brand) {
  const warnings = [];
  r = Object.fromEntries(
    Object.entries(r).map(([k, v]) => {
      if (v.includes("\u0000")) {
        warnings.push(`Removed NUL character from ${k}`);
        v = v.replaceAll("\u0000", "");
      }
      return [k, v];
    }),
  );
  if (kind === "contacts") {
    if (!r.external_id) throw new Error("Missing external_id");
    if (r.brand_code && r.brand_code.toLowerCase() !== brand.slug)
      throw new Error("Brand code does not match file");
    const originalEmail = r.email ?? r.e_mail,
      email = blank(originalEmail) ? null : originalEmail.toLowerCase();
    const validEmail =
      email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
    if (email && !validEmail)
      warnings.push("Malformed email excluded from email sends");
    let status = (r.status ?? "").trim().toLowerCase();
    if (status === "unsubscribe") status = "unsubscribed";
    if (!["active", "bounced", "unsubscribed", "pending"].includes(status)) {
      warnings.push("Unknown status excluded from sending");
      status = "pending";
    }
    let country = r.country ?? r.pays;
    country = blank(country) ? null : country.toUpperCase();
    const aliases = { KENYA: "KE", "SOUTH AFRICA": "ZA", MOROCCO: "MA" };
    country = aliases[country] ?? country;
    if (country && !/^[A-Z]{2}$/.test(country)) {
      warnings.push("Invalid country stored as unknown");
      country = null;
    }
    const deleted_at = date(r.deleted_at, "deletion time", warnings),
      suppressed_until = date(r.suppressed_until, "suppression time", warnings);
    if (
      (!blank(r.deleted_at) && !deleted_at) ||
      (!blank(r.suppressed_until) && !suppressed_until)
    ) {
      status = "pending";
      warnings.push("Ambiguous suppression/deletion excluded from sending");
    }
    return {
      row: {
        brand_id: brand.id,
        external_id: r.external_id,
        full_name: r.full_name || null,
        email: validEmail,
        phone: (r.phone ?? r.mobile) || null,
        country,
        city: r.city || null,
        status,
        consent_marketing: consent(r.consent_marketing),
        signup_at: date(r.signup_at, "signup time", warnings),
        deleted_at,
        suppressed_until,
        brand_code: brand.slug.toUpperCase(),
        notes: r.notes || null,
      },
      warnings,
    };
  }
  if (kind === "campaigns") {
    if (!r.external_id || !r.campaign_name)
      throw new Error("Missing campaign identity/name");
    const channel = r.channel?.toLowerCase();
    if (!["email", "sms"].includes(channel))
      throw new Error("Unknown campaign channel");
    const row = {
      brand_id: brand.id,
      external_id: r.external_id,
      campaign_name: r.campaign_name,
      channel,
      target_country: r.target_country || null,
      sent_at_utc: date(r.sent_at_utc, "send time", warnings),
      send_local_time: r.send_local_time || null,
      parent_campaign_id: r.parent_campaign_id || null,
    };
    for (const k of [
      "reported_sent",
      "reported_delivered",
      "reported_bounced",
      "reported_opens",
      "reported_clicks",
      "spend",
    ]) {
      const n = Number(
        k === "spend" ? (r[k] || "0").replace(",", ".") : r[k] || 0,
      );
      if (
        !Number.isFinite(n) ||
        n < 0 ||
        (k !== "spend" && !Number.isInteger(n))
      )
        throw new Error(`Invalid ${k}`);
      row[k] = n;
    }
    return { row, warnings };
  }
  if (kind === "events") {
    if (!r.event_id || !r.external_contact_id || !r.campaign_external_id)
      throw new Error("Missing event relationship");
    if (
      ![
        "bounce",
        "open",
        "click",
        "complaint",
        "unsubscribe",
        "delivered",
        "bounced",
        "opened",
        "unsubscribed",
      ].includes(r.event_type)
    )
      throw new Error("Unknown event type");
    const occurred_at_utc = date(r.occurred_at_utc, "event time", warnings);
    if (!occurred_at_utc) throw new Error("Invalid event time");
    return {
      row: {
        brand_id: brand.id,
        event_id: r.event_id,
        external_contact_id: r.external_contact_id,
        campaign_external_id: r.campaign_external_id,
        event_type: r.event_type,
        channel: r.channel || null,
        occurred_at_utc,
      },
      warnings,
    };
  }
  throw new Error("Unsupported file");
}
async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const { data: brands, error } = await db.from("brands").select("id,slug");
  if (error) throw error;
  const files = fs
    .readdirSync("data/raw")
    .filter(
      (f) =>
        /-(contacts|campaigns|events).*\.csv$/.test(f) &&
        (!process.env.IMPORT_CONTACTS_ONLY || f.includes("-contacts")) &&
        (!process.env.IMPORT_CAMPAIGNS_ONLY || f.includes("-campaigns")),
    )
    .sort(
      (a, b) =>
        Number(a.includes("delta")) - Number(b.includes("delta")) ||
        a.localeCompare(b),
    );
  for (const file of files) {
    const brand = brands.find((b) => file.startsWith(b.slug + "-"));
    if (!brand) throw new Error("Unmapped brand file");
    const kind = file.split("-")[1].split(".")[0],
      raw = fs.readFileSync(path.join("data/raw", file), "utf8"),
      hash = createHash("sha256").update(raw).digest("hex");
    const source =
      file +
      "#" +
      hash +
      (["contacts", "campaigns"].includes(kind) ? "#normalizer-v2" : "");
    const { data: prior } = await db
      .from("import_runs")
      .select("id")
      .eq("source_file", source)
      .eq("brand_id", brand.id)
      .limit(1);
    if (prior?.length) {
      console.log(file + ": already imported, skipped identical file");
      continue;
    }
    const parsed = parseCsv(raw),
      dedup = new Map(),
      errors = [],
      quarantine = [];
    let skipped = 0;
    for (const entry of parsed) {
      try {
        if (!entry.value) throw new Error("Wrong column count");
        const { row, warnings } = normalize(entry.value, kind, brand);
        if (kind === "contacts") row.source_file = file;
        const key = row.external_id ?? row.event_id;
        if (dedup.has(key)) {
          skipped++;
          errors.push({
            line: entry.line,
            reason: "Duplicate key within export; last valid row wins",
          });
        }
        dedup.set(key, row);
        for (const warning of warnings)
          errors.push({ line: entry.line, reason: warning });
      } catch (e) {
        skipped++;
        errors.push({ line: entry.line, reason: e.message });
        if (kind === "contacts" && entry.value?.external_id)
          quarantine.push(entry.value.external_id);
      }
    }
    // Previously imported invalid records are retained for audit, but never sendable.
    const unsafe = [...new Set(quarantine)].filter((id) => !dedup.has(id));
    for (let i = 0; i < unsafe.length; i += 100) {
      const { error: e } = await db
        .from("contacts")
        .update({ status: "pending", consent_marketing: false })
        .eq("brand_id", brand.id)
        .in("external_id", unsafe.slice(i, i + 100));
      if (e) throw e;
    }
    const rows = [...dedup.values()].map((r) =>
        kind === "contacts" ? { ...r, import_valid: true } : r,
      ),
      table = kind === "events" ? "provider_events" : kind;
    for (let i = 0; i < rows.length; i += 100) {
      let failure;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error: e } = await db
          .from(table)
          .upsert(rows.slice(i, i + 100), {
            onConflict:
              kind === "events" ? "brand_id,event_id" : "brand_id,external_id",
          });
        failure = e;
        if (!e) break;
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
      if (failure) throw new Error(file + ": " + failure.message);
    }
    const { error: e } = await db
      .from("import_runs")
      .insert({
        brand_id: brand.id,
        source_file: source,
        rows_seen: parsed.length,
        rows_imported: rows.length,
        rows_skipped: skipped,
        errors,
      });
    if (e) throw e;
    console.log(
      `${file}: ${parsed.length} seen; ${rows.length} applied; ${skipped} skipped; ${errors.length} issues`,
    );
  }
}
if (process.argv[1]?.endsWith("import-seed.mjs"))
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
