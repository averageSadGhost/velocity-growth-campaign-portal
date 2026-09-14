# Velocity Growth Campaign Portal

Production: https://velocity-growth-campaign-portal.vercel.app/
Source: https://github.com/averageSadGhost/velocity-growth-campaign-portal

Next.js 16 / React 19 / TypeScript, Supabase Auth + Postgres, Vercel server routes.
AI assistance: OpenAI Codex. Credentials and the synthetic source ZIP are not committed.

## Setup

1. Run `npm ci` with Node 22.18+.
2. Apply SQL in this order: `supabase/schema.sql`, `hardening.sql`, `results.sql`, `final-integrity.sql`, `import-validity.sql`, `security-maintenance.sql`.
3. Create the three brands and six Auth users. Insert exactly one `brand_members` owner/analyst membership per user. Do not grant self-service membership creation. The chosen Google account replaces the Karoo test owner.
4. Enable Email and Google Auth. Register the Supabase `/auth/v1/callback` URL with Google. Set Supabase Site URL and allowed redirects to the actual application origin. Google sign-in does not grant membership.
5. Copy `.env.example` to `.env.local` and fill values privately. Only URL and publishable key use the `NEXT_PUBLIC_` prefix. The server requires the service key, provider key/base URL, and a random `WORKER_SECRET`.
6. Verify the supplied ZIP SHA-256 is `4961a25b151ca13ac56089ca46b94def6074c315445ec193c7bf87060683d35c`; extract CSVs into `data/raw`.
7. Run `node --env-file=.env.local scripts/import-seed.mjs`, then `node --env-file=.env.local scripts/import-send-log.mjs`. If repairing an older import, run `scripts/reconcile-imports.mjs` with the same environment.
8. Run `npm run dev`. On Vercel, configure the same production environment variables and deploy using `vercel deploy --prod`.
9. Store the worker secret privately in Supabase Vault as `velocity_worker_secret`; apply `supabase/schedule.sql` after updating its URL for your deployment. It invokes the worker each minute without an open browser.

## Authorization and data

The browser uses the **Supabase publishable key**, not the service key. Authenticated requests still require a live `brand_members` row. Unassigned OAuth/password accounts get no portal or tenant rows. Owners create campaigns, approve sends, and publish results. Analysts read only.

Tables: `brands`, `brand_members`, `contacts`, `campaigns`, `provider_events` (imported history), `send_batches` (historical send log), `import_runs`, `dispatches`, `delivery_events`, `share_links`, `share_attempts`.
Views: `contact_eligibility`, `campaign_results`.
Functions: `member_brand_ids`, `is_brand_owner`, `workspace_stats`, `prepare_dispatch`, `approve_dispatch`, `claim_dispatch`, `consume_share_attempt`, `preserve_approval`.

RLS lives in `supabase/schema.sql`, extended in the subsequent SQL files. Reporting views are SECURITY INVOKER. Service-only RPCs reject client execution; APIs authenticate first and derive the actor from the validated session. Composite foreign keys enforce same-brand campaign/dispatch relationships. Default grants are revoked for future public tables/functions created by postgres: new data is closed until explicitly reviewed and granted.

## Import and metric definitions

The parser handles BOM, comma/semicolon exports, quoted newlines, escaped quotes, case/space header differences and decimal-comma spend. Consent accepts true/false, yes/no, y/n, t/f and 1/0 in any case; anything else is rejected as ambiguous. Exact file hash plus normalizer version identifies an import. Brand + external ID (event ID for events) is the upsert key. Last valid duplicate wins within a file; the dated delta is applied after the base. Imports expose row numbers and reasons, including rejected records and normalization warnings. Invalid consent/brand rows are rejected; ambiguous deletion/suppression dates block sending. Rejected legacy contacts remain available only to the administrator for audit, not in tenant views/totals/sends.

- Total customers: valid imported identities per brand, including inactive, deleted and suppressed contacts. Not a count of unique email addresses.
- Contactable: active + marketing consent + no deletion + no current suppression, excluding any historical or live bounce, complaint or unsubscribe. This conservative suppression does not automatically reset on a later delivery. Actual email/SMS destination validity and deduplication are checked at preview.
- Daily signups: signup timestamp grouped by UTC day, last 30 calendar days including today, zero-filled. Unknown timestamps do not contribute.
- Imported campaigns retain explicitly labeled reported totals; opens can exceed sent because they may be repeated events.
- Live sends count provider-accepted recipients as sent, unique recipients for delivery/open/click/bounce, and a bounce overrides delivery. These are observed reports, not assumed delivery. A polling campaign may still receive later events.
- Historical send logs are retained separately; the source did not include their exact recipient identities, so the app does not invent an approval snapshot.

Contacts/campaigns use server-side filtering and 40-row pages. CSV export fetches all matching pages, not just the visible page. Spreadsheet formula prefixes are escaped. Search exists only on Contacts and Campaigns.

## Durable sending and reports

`POST /api/send` prepares a server-computed immutable preview. It contains every approved recipient and an exact count. Confirmation revalidates permissions, expiry (15 minutes), count and suppression/destination changes. A lock plus unique approved-campaign index collapses repeated/concurrent approvals to one durable dispatch.

`POST /api/worker` requires the private worker bearer secret. A database lease claims queued work. Every provider request carries the issued provider key; sends use the dispatch UUID as the idempotency key. Timeouts/retries retain the identical payload/key. Acceptance and rejection are saved before report polling. The minute worker continues after the browser closes and retries with bounded exponential backoff.

Reports are polled from the provider's documented events endpoint (not a webhook). Pages are committed before advancing the cursor; completed passes replay to catch late/out-of-order events. Duplicate IDs are ignored. Unknown/malformed/out-of-audience or conflicting-brand events are skipped with sanitized `dispatches.report_warnings`, never imported into another tenant. A temporarily stationary cursor waits for the next pass. Approved recipient content is database-immutable.

Inspect progress in Campaigns, `dispatches` (approval, frozen audience, batch ID, provider response, lease, retry, errors, poll time, warnings), and `delivery_events`. Export approved audience for an audit copy. Admin recovery: inspect the error/provider record; retain the same dispatch ID and payload; clear an expired lease or set `next_attempt_at` to retry. Do not create a second dispatch for an uncertain send.

## Password-protected reports

Share tokens have 192 random bits. Passwords use random-salt scrypt and constant-time comparison. The public route exposes a fixed aggregate field allowlist for one campaign only. Share rows/hashes are inaccessible via public/authenticated Data API. A database-backed token bucket limits guesses to 20 per 15 minutes; a busy shared link can be temporarily rate-limited too. Responses are no-store. Admins can revoke a link with `revoked_at`.

## Verification

- `node --test tests/security.test.ts tests/import.test.mjs`
- `npm run build`
- Execute `supabase/isolation.test.sql` independently (it rolls back). It impersonates every assigned user and an unassigned user, tests cross-brand visibility, private-table/RPC denial and analyst writes.
- Mutation check: within a rollback-only transaction, disable contacts RLS and run the assertions; they **must fail**. Never deploy with RLS disabled.
- `TEST_BASE_URL=https://your-app node --env-file=.env.local scripts/verify-live.mjs` checks real login, stats and API denial. Optional `TEST_MUTATIONS=1 TEST_SHARE_PASSWORD=...` creates a protected test link. Use only the authorized synthetic accounts.
- Re-run the importer: identical exports must report no-op skips.
- Browser: password sign-in, Contacts/Campaigns search + export, new draft, preview/cancel, Settings/profile, phone-width navigation and protected results.

Live verification on 13 September 2026: concurrent approvals produced one nine-recipient synthetic-provider batch; all nine were accepted. Reports included duplicates, reordered timestamps, and a forged foreign-brand event; valid delivery/open metrics were recorded and the forged event was excluded. The autonomous cron subsequently returned HTTP 200.

## Operational limitations

No public signup, notification preference switches, or re-consent workflow is provided. Google sign-in was configured and exercised during setup; the personal Google flow should be demonstrated by the account holder during review. The requested weak demo password is unsuitable for real customers. Supabase leaked-password protection is disabled for this test environment. The platform's non-relocatable pg_net extension may retain a schema-placement advisory; share_attempts intentionally has no client RLS policy. Watch `cron.job_run_details`, `net._http_response` and dispatch errors for provider/platform outages. There is no separate external error-alerting service.

Submission email must include six credentials, the issued provider key, private share URL/password, time spent, earliest start date and notice period. Keep these outside the public repository.
