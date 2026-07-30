# Production Configuration Check

`npm run verify:production` is the deploy-time guardrail for Ballot Clarity's production environment.

It checks the environment values and active coverage snapshot that determine whether the public site is operating as a real civic-information service rather than a local or seeded development runtime.

## What It Checks

- Public origins use HTTPS and do not point at localhost, reserved placeholder domains, private IP ranges, or internal-only hostnames.
- `NUXT_PUBLIC_API_BASE` points at the public `/api` path.
- `ADMIN_API_BASE` is configured as a private server-side target, not the same public API base used by browsers.
- `ADMIN_API_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, `ACTIVE_LOOKUP_COOKIE_SECRET`, and `ADDRESS_CACHE_ENCRYPTION_KEY` are present, long enough, and not obvious placeholder values.
- `CONTACT_ADDRESS` or `NUXT_CONTACT_ADDRESS` is configured as a valid, non-placeholder support email for the protected public contact route.
- `CONTACT_ADDRESS_SESSION_SECRET` or `NUXT_CONTACT_ADDRESS_SESSION_SECRET` is present, long enough, and not an obvious placeholder value.
- `NUXT_PUBLIC_OPERATOR_LEGAL_NAME`, `NUXT_PUBLIC_GOVERNING_LAW`, and `NUXT_PUBLIC_VENUE` are explicitly configured for production Terms and Privacy copy and do not contain placeholder text.
- Optional public feedback, public lookup, and admin login throttle values are positive integers when set.
- `TRUST_PROXY` names explicit trusted proxy IPs, CIDR ranges, or named ranges; broad boolean and hop-count trust is rejected.
- Optional ballot-content provider endpoint URLs use HTTPS, are valid absolute URLs, and do not point at localhost, reserved placeholder domains, private IP ranges, or internal-only hostnames when set.
- Optional ballot-content provider keys and endpoints are paired where the connector would otherwise be ignored or incomplete.
- `ADMIN_STORE_DRIVER=postgres` and a Postgres `ADMIN_DATABASE_URL` or `DATABASE_URL` is configured.
- `LIVE_COVERAGE_REQUIRED=true` is enabled.
- `LIVE_COVERAGE_FILE` exists and has a matching `.meta.json` sidecar.
- Snapshot metadata is `reviewed` or `production_approved`, uses `sourceType: "imported"`, and includes the required review timestamps.
- `production_approved` snapshots include `approvedAt`.
- `reviewed` and `production_approved` snapshot payloads include the minimum public coverage shape: election, jurisdiction, location, summaries, source context, and official resources.
- `reviewed` and `production_approved` snapshot payloads do not contain known staged/reference candidate names, placeholder or internal public URLs, `seeded_demo` or `staged_reference` content markers, or `mixedContent: true`.

Reviewed-but-not-approved snapshots pass with a warning because Ballot Clarity may intentionally run an official-logistics-only reviewed package while public copy keeps that state visible. Seed, unknown, missing, or unreviewed snapshots fail.

## Usage

Use the active server environment:

```bash
npm run verify:production
```

Use a specific environment file during handoff review:

```bash
npm run verify:production -- --env-file /path/to/production.env
```

Emit machine-readable output:

```bash
npm run verify:production -- --json
```

## Scope

This check does not replace full editorial content validation. It does provide a deploy-time backstop for the most dangerous snapshot states: production-eligible packages that are only empty shells, still carry reference-archive candidates, contain placeholder or internal URLs, contain staged guide markers, or expose mixed-content flags.

This check verifies the runtime contract around that content: public origins, admin persistence, protected contact and legal-policy configuration, admin-MFA, saved-lookup, and address-cache encryption secrets, throttle configuration, optional ballot-content provider and source-asset endpoint safety, live snapshot requirement, and snapshot provenance.
