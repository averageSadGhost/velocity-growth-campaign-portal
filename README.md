# Velocity Growth Campaign Portal

Secure multi-tenant campaign reporting portal for Kilele Rides, Karoo Coaches, and Marrakech Express.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Apply [`supabase/schema.sql`](./supabase/schema.sql) in the Supabase SQL editor, then configure Email and Google under Authentication > Providers. The browser only receives `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; provider and service credentials are server-only.

## Security decisions

- Every brand-scoped table carries `brand_id` and has RLS enabled.
- Membership authorization is derived from `brand_members`, never editable user metadata.
- Sends are represented by unique `brand_id + batch_key` rows so retries can be made idempotent.
- Shared-link records are not exposed to anonymous or authenticated Data API clients; the password-checking route will be server-only.
- Import uniqueness is enforced by `unique(brand_id, external_id)` and import diagnostics are persisted in `import_runs`.

## Implemented flows

- Three brand-scoped workspaces load live contacts and campaigns from Supabase.
- Email/password and Google authentication are supported; access is controlled by `brand_members`.
- Contacts and campaigns have scoped search and CSV export. Owners can create campaigns and launch an idempotent provider send after a live recipient count is shown.
- Provider callbacks are accepted at `/api/provider/events/[batchId]`, deduplicated by event ID, persisted in `provider_events`, reflected in campaign metrics, and applied to unsubscribe status.
- Owners can create password-protected campaign result links at `/share/[token]`; share records are not exposed through the anonymous Data API.
- The dashboard includes exact contactable counts, campaign performance, and daily signups over the last 30 days. Loading and empty states are visible.

## Verification checklist

Before submission, create and verify six Supabase Auth accounts (three owners and three analysts), configure the provider callback secret and callback URL, run the RLS isolation checks for every brand, and push this repository to a public GitHub repository. The deployed app uses only the public Supabase key in the browser; provider and service credentials remain server-only.
