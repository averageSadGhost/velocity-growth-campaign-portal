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

## Verification status

The visual shell and auth entry points are implemented. Provider endpoint details, real seed import, six test users, Google provider configuration, webhook ingestion, and deployment still require the remaining integration pass.
