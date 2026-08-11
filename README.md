# Ballot Clarity

Ballot Clarity is a nonpartisan civic-information platform built as an npm workspace monorepo. It provides address-based civic lookup, current representative context, official election resources, source transparency, and a reviewed local-guide publishing path. Fulton County, Georgia is the first launch jurisdiction; its current production-safe package is official-logistics-only until verified local contest, candidate, and measure records are available.

## Workspace layout

- `front-end/`: Nuxt 4 application for the public civic-information site and protected admin review tools
- `front-end/src/`: public pages, admin pages, layouts, components, composables, stores, and shared front-end types
- `front-end/public/source-files/`: reference source files that power the public source directory and evidence links
- `back-end/`: Express API for ballot content, public search, source records, and admin operations
- `back-end/src/coverage-data.ts`: seed fixture data used for local verification and route-contract tests, not as a production default
- `back-end/src/coverage-repository.ts`: runtime coverage loader that starts in empty mode unless an imported live snapshot file is configured
- `back-end/src/import-live-coverage.ts`: operator CLI that imports a vetted coverage snapshot from a file or URL
- `back-end/src/export-fulton-reviewed-coverage.ts`: operator CLI that exports the reviewed Fulton official-logistics-only snapshot and metadata sidecar
- `back-end/src/admin-mfa.ts`: TOTP helper for admin multi-factor authentication setup and verification
- `back-end/src/census-geocoder.ts`, `back-end/src/openstates.ts`, and `back-end/src/address-enrichment.ts`: address-to-district enrichment path using Census geographies plus Open States representative matching
- `back-end/src/launch-directory.ts` and `back-end/src/sync-launch-directory.ts`: provider-fed launch-directory ingestion scaffold for elections and representative records
- `back-end/live-data-schema.sql`: draft Postgres schema scaffold for the future live-data read model
- `back-end/src/admin-store.ts`: SQLite-backed fallback admin persistence for users, content review, source monitoring, corrections, and activity
- `back-end/src/postgres-admin-store.ts`: Postgres-backed admin persistence for multi-instance production deployments
- `back-end/src/launch-profile.ts`: Fulton County, Georgia launch profile, official source links, and coverage-state metadata
- `back-end/admin-schema.sql`: schema for persisted admin and operations data
- `back-end/admin-schema.postgres.sql`: schema for Postgres-backed admin persistence
- `back-end/dist/admin-schema.sql` and `back-end/dist/admin-schema.postgres.sql`: runtime copies emitted during `npm run build` so compiled deployments can initialize the configured admin store
- `docs/fulton-county-ga-launch.md`: chosen official systems, provider stack, and manual provisioning inputs for the first real jurisdiction

## Install and run

Install dependencies from the repo root:

```bash
npm install
```

Copy the environment template:

```bash
npm run env:local
```

Bring up the local service stack:

```bash
npm run stack:up
```

This starts:

- local Postgres on `127.0.0.1:5432`
- local MinIO object storage on `127.0.0.1:9000`
- local MinIO console on `127.0.0.1:9001`

If you do not want to run Docker locally, use the provider-local path instead:

```bash
npm run local:setup
```

That path:

- loads `.env` and `.env.local` from the current checkout, or falls back to the shared repo root when you are running inside a git worktree
- keeps Google Civic, `api.data.gov`, Open States, and LDA wired from your local provider keys
- prefers IPv4 for Google Civic in provider-local mode unless you explicitly override `GOOGLE_CIVIC_FORCE_IPV4`
- forces the admin store to sqlite for local use
- disables the Postgres-backed address cache for that run
- serves source files from Nuxt's built-in public mirror instead of MinIO
- writes a local seed coverage snapshot and provider-fed launch-directory snapshot for development only

After that, run the API in one terminal:

```bash
npm run server:local:watch
```

Then run the Nuxt front-end in another terminal:

```bash
npm run dev:local
```

Use the Docker stack only when you want local Postgres address caching and MinIO parity with the fuller infrastructure path.

To verify the real local runtime with your configured provider keys, run:

```bash
npm run verify:local
```

That command:

- discovers the current worktree `.env` or the shared repo-root fallback automatically
- forces the API and front-end base URLs onto localhost for that run
- writes a fresh local seed coverage snapshot
- runs provider credential probes without printing secrets
- starts the API locally
- probes `/health` and a real ZIP lookup (`84604`) to confirm districts and representatives populate

For production monitoring, use the minimal `GET`/`HEAD` probes documented in
[`HEALTHCHECKS.md`](HEALTHCHECKS.md). `/health` remains a compatibility alias for
readiness, while `/healthz` is dependency-free liveness.

Write a local seed snapshot so the API can run in snapshot mode for route and UI verification:

```bash
npm run coverage:seed-local
```

Seed snapshots are not production coverage. For a reviewed Fulton handoff, use the reviewed export path described in `back-end/docs/live-coverage-ops.md`.

Bootstrap the first admin user before using `/admin`:

```bash
npm run bootstrap-admin
```

Run the API in one terminal:

```bash
npm run server
```

Run the Nuxt front-end in another terminal:

```bash
npm run dev
```

The front-end runs at `http://127.0.0.1:3333` and expects the API at `http://127.0.0.1:3001/api` by default.

For local Google Civic testing:

1. Open the generated `.env`
2. Paste your `GOOGLE_CIVIC_API_KEY`
3. If the key is restricted to the machine's IPv4 and your host prefers IPv6 egress, set `GOOGLE_CIVIC_FORCE_IPV4=true`
4. Restart the backend
5. Submit a full street address in the lookup form

When the key is configured, Ballot Clarity will call Google Civic server-side for full-address verification and show any official links returned by the provider before continuing into the ballot guide. When Open States is also configured, the same lookup flow will attach matched district and representative context. ZIP-only input remains approximate by design.

For cached district enrichment:

- Census geocoding does not require a key and now powers normalized address geography for full-address lookups.
- If `ADMIN_DATABASE_URL` and `ADDRESS_CACHE_ENCRYPTION_KEY` are configured, Ballot Clarity caches the lookup result in the `address_lookups` table for no more than 7 days. The lookup key is a keyed HMAC and the payload is authenticated AES-256-GCM ciphertext; legacy plaintext rows are removed during migration.
- `OPENSTATES_API_KEY` enables representative matching from the geocoded point via `people.geo`.

For federal provider setup:

- `DATA_API_KEY` is the shared `api.data.gov` credential. Ballot Clarity will use it as a fallback for both Congress.gov and OpenFEC when `CONGRESS_API_KEY` or `OPENFEC_API_KEY` are unset.
- If you prefer separate credentials later, set `CONGRESS_API_KEY` and `OPENFEC_API_KEY` explicitly and they will take precedence over `DATA_API_KEY`.
- `GOOGLE_CIVIC_FORCE_IPV4=true` makes Ballot Clarity use an IPv4-only HTTPS transport for Google Civic requests without changing global Node networking behavior.
- `OPENSTATES_FETCH_TIMEOUT_MS`, `OPENFEC_FETCH_TIMEOUT_MS`, and `LDA_FETCH_TIMEOUT_MS` bound provider requests so runtime and scheduled workflows fail or degrade cleanly instead of hanging indefinitely.

To verify the currently configured provider keys without printing them:

```bash
npm run providers:test
```

For a no-Docker local run that still loads your provider keys from the local/shared `.env`, use:

```bash
npm run providers:test:local
```

That command now runs the compiled backend entrypoint and is safe for prod-only installs after `npm run build`. For source-level local debugging before a build, use:

```bash
npm run providers:test:src
```

To write a provider-fed launch-directory snapshot for future district and representative route work:

```bash
npm run launch-directory:sync
```

For the no-Docker local provider path, use:

```bash
npm run launch-directory:sync:local
```

That command also runs the compiled backend entrypoint and is safe for prod-only installs after `npm run build`. For source-level local debugging before a build, use:

```bash
npm run launch-directory:sync:src
```

## Environment configuration

Public runtime variables:

- `NUXT_PUBLIC_SITE_URL`: canonical public origin used for metadata, schema, and canonical URLs
- `NUXT_PUBLIC_API_BASE`: public API base used by the front-end for ballot, search, sources, and content reads
- `NUXT_PUBLIC_API_FETCH_TIMEOUT_MS`: positive public API request timeout in milliseconds for browser, SSR, and sitemap reads; defaults to 15 seconds
- `NUXT_PUBLIC_BUILD_ID`: optional deploy or release identifier exposed to the client so stale tabs can detect a newer server build and force a safe refresh instead of failing on missing hashed chunks

Local infrastructure variables:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_BIND_ADDRESS`, `POSTGRES_PORT`: values used by the local Docker Postgres service and the derived `ADMIN_DATABASE_URL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET`, `MINIO_BIND_ADDRESS`, `MINIO_PORT`, `MINIO_CONSOLE_BIND_ADDRESS`, `MINIO_CONSOLE_PORT`: values used by the local MinIO service and bucket bootstrap

The Compose stack is development-only. It pins container images by immutable digest, requires generated passwords, and binds database/object-storage ports to loopback by default. Do not use the local Compose file as a production topology or change the bind addresses to a public interface without a separate firewall and access-control review.

Server-only variables:

- `ADMIN_API_BASE`: server-side Nuxt proxy target for admin-only API requests; this should be private to the Nuxt server and never exposed as the browser's direct `/api/admin/*` target
- `ADMIN_API_FETCH_TIMEOUT_MS`: positive server-to-server admin API request timeout in milliseconds; defaults to 15 seconds
- `ADMIN_API_KEY`: shared secret between the Nuxt admin proxy and the Express admin endpoints
- `ADMIN_API_RATE_LIMIT_WINDOW_MS`, `ADMIN_API_RATE_LIMIT_MAX`, `ADMIN_API_RATE_LIMIT_MAX_BUCKETS`: coarse per-connection limit across all private admin API requests; the bounded in-memory store defaults to 1,000 requests per 15 minutes and fails closed for unseen connections when its 10,000-bucket cap is full
- `ADMIN_SESSION_SECRET`: cookie-signing secret for Nuxt admin sessions
- `ADMIN_MFA_ENCRYPTION_KEY`: dedicated authenticated-encryption key for admin TOTP seeds at rest; use a unique random value of at least 32 characters
- `ACTIVE_LOOKUP_COOKIE_SECRET`: dedicated authenticated-encryption secret for the HttpOnly saved-area result cookie; use a unique random value of at least 32 characters
- `ADDRESS_CACHE_ENCRYPTION_KEY`: dedicated key for address-cache HMAC identifiers and authenticated payload encryption; use a unique random value of at least 32 characters
- `ADMIN_STORE_DRIVER`: `postgres` for production, or `sqlite` only as a fallback for single-instance local/dev use; when omitted, the backend will auto-select Postgres if `ADMIN_DATABASE_URL` or `DATABASE_URL` is present
- `ADMIN_DB_PATH`: SQLite database path for fallback persisted admin users and editorial operations data
- `ADMIN_DATABASE_URL`: Postgres connection string for the admin and editorial operations store
- `CONTACT_ADDRESS`: support email address returned by the protected `/api/contact-address` route after the same-origin nonce challenge succeeds
- `CONTACT_ADDRESS_SESSION_SECRET`: server-only secret that signs short-lived protected-contact nonce sessions; use a dedicated value in production rather than reusing admin session secrets
- `CONTACT_ADDRESS_RATE_LIMIT_WINDOW_MS`, `CONTACT_ADDRESS_RATE_LIMIT_MAX`, `CONTACT_ADDRESS_RATE_LIMIT_MAX_BUCKETS`: optional in-memory abuse controls for the protected contact endpoint; the bucket cap defaults to 10,000 and fails closed for unseen connections when full
- `PUBLIC_FEEDBACK_RATE_LIMIT_WINDOW_MS`, `PUBLIC_FEEDBACK_RATE_LIMIT_MAX`, `PUBLIC_FEEDBACK_RATE_LIMIT_MAX_BUCKETS`: optional in-memory abuse controls for repeated public contact/correction form submissions from the same connection; the bucket cap defaults to 10,000 and fails closed for unseen connections when full
- `PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_MS`, `PUBLIC_LOOKUP_RATE_LIMIT_MAX`, `PUBLIC_LOOKUP_RATE_LIMIT_MAX_BUCKETS`: optional in-memory abuse controls for repeated public civic lookup requests from the same connection; the bucket cap defaults to 10,000 and fails closed for unseen connections when full
- `LOCATION_GUESS_MODE`, `LOCATION_GUESS_PROXY_HEADERS_TRUSTED`, and `LOCATION_GUESS_PROXY_*_HEADERS`: optional approximate location guessing from trusted edge-proxy geography; `proxy_headers` remains fail-closed until provenance is explicitly asserted, and the edge must remove client-supplied copies before overwriting the configured headers
- `SOURCE_ASSET_BASE_URL`: optional public object-storage or CDN base URL for mirrored source files
- `LIVE_COVERAGE_FILE`: path to the imported coverage snapshot consumed by the public API
- `LIVE_COVERAGE_REQUIRED`: when `true`, fail startup if `LIVE_COVERAGE_FILE` is missing
- `HOST`: Express API bind address; defaults to loopback (`127.0.0.1`) and should only use a broader interface when a private container or platform network requires it
- `TRUST_PROXY`: explicit trusted reverse-proxy IPs, CIDR ranges, or named ranges; use `loopback` for same-host Nginx and never use broad `true` trust
- `LOG_LEVEL`: structured backend log level, such as `info`, `warn`, or `error`
- `ADMIN_LOGIN_WINDOW_MS`, `ADMIN_LOGIN_MAX_ATTEMPTS`, `ADMIN_LOGIN_IP_MAX_ATTEMPTS`, `ADMIN_LOGIN_LOCKOUT_MS`, `ADMIN_LOGIN_MAX_BUCKETS`: independent account and source-IP verification throttles shared by login, password-change, and MFA workflows; the bucket cap bounds memory and fails closed for previously unseen account/address pairs when full; values must be positive integers when set
- `GOOGLE_CIVIC_FORCE_IPV4`: when `true`, Google Civic requests prefer IPv4 egress so IPv4-restricted API keys work on hosts that otherwise default to IPv6
- `GOOGLE_CIVIC_FETCH_TIMEOUT_MS`, `CONGRESS_FETCH_TIMEOUT_MS`, `CENSUS_GEOCODER_FETCH_TIMEOUT_MS`, `ZIP_LOCATION_FETCH_TIMEOUT_MS`, `OPENSTATES_FETCH_TIMEOUT_MS`, `OPENFEC_FETCH_TIMEOUT_MS`, `LDA_FETCH_TIMEOUT_MS`: positive request timeouts in milliseconds for upstream civic providers; each defaults to 15 seconds so a stalled provider cannot hold an API request open indefinitely
- `PROVIDER_RESPONSE_MAX_BYTES`: maximum decoded response body accepted from any civic provider; defaults to 5 MiB so a malformed or compromised upstream cannot exhaust process memory
- `ADDRESS_CACHE_MAX_ROWS`: maximum newest encrypted address-lookup rows retained inside the seven-day expiration window; defaults to 100,000
- `REPRESENTATIVE_MODULE_CACHE_MAX_ENTRIES`, `REPRESENTATIVE_MODULE_CACHE_TTL_MS`: bounds the in-process provider-enrichment cache; defaults to 1,000 least-recently-used entries with a 15-minute freshness window
- `PUBLIC_REPRESENTATIVE_CACHE_MAX_ENTRIES`, `PUBLIC_REPRESENTATIVE_CACHE_TTL_MS`: bounds direct provider-backed representative identity lookups; defaults to 1,000 least-recently-used entries with a 15-minute freshness window, while the public lookup throttle limits request volume
- `BALLOTCLARITY_ZIP_LOOKUP_LOG_ENABLED`, `BALLOTCLARITY_ZIP_LOOKUP_LOG_PATH`, `BALLOTCLARITY_ZIP_LOOKUP_LOG_MAX_BYTES`: optional privacy-minimized exact-ZIP event logging; the active file is permission-restricted, rotates to one permission-restricted backup at 10 MiB by default, and never records full addresses, network addresses, or user agents
- `CENSUS_GEOCODER_BENCHMARK`, `CENSUS_GEOCODER_VINTAGE`: optional overrides for reproducible Census geocoder lookups
- `CTCL_BIP_API_URL`, `CTCL_BIP_API_KEY`: optional Center for Tech and Civic Life Ballot Information Project endpoint and access key once direct access is granted
- `BALLOTPEDIA_API_KEY`, `BALLOTPEDIA_API_BASE_URL`: optional Ballotpedia API credentials and base URL override for future race, candidate, and measure ingestion
- `BALLOTREADY_API_URL`, `BALLOTREADY_API_KEY`: optional BallotReady CivicEngine GraphQL endpoint and access key
- `DEMOCRACY_WORKS_API_KEY`, `DEMOCRACY_WORKS_API_BASE_URL`: optional Democracy Works Elections API credentials and base URL override

One-time bootstrap variables:

- `ADMIN_BOOTSTRAP_USERNAME`: username used by `npm run bootstrap-admin`
- `ADMIN_BOOTSTRAP_PASSWORD`: password used by `npm run bootstrap-admin`
- `ADMIN_BOOTSTRAP_DISPLAY_NAME`: display label for the initial admin user
- `ADMIN_BOOTSTRAP_ROLE`: initial role, usually `admin`

Runtime variables:

- `HOST`: Express API bind address, defaulting to `127.0.0.1`
- `PORT`: Express API port

One-time or scheduled ingestion variables:

- `LIVE_COVERAGE_SOURCE_FILE`: local JSON file path consumed by `npm run ingest:coverage`
- `LIVE_COVERAGE_SOURCE_URL`: public HTTPS JSON URL consumed by `npm run ingest:coverage`; private/local/reserved destinations and unsafe redirects are rejected, so use `--from-file` for privately retrieved snapshots
- `LIVE_COVERAGE_FETCH_TIMEOUT_MS`, `LIVE_COVERAGE_FETCH_MAX_BYTES`: remote coverage import time and response-size ceilings
- `DATA_API_KEY`: shared `api.data.gov` credential used as a fallback for Congress.gov and OpenFEC
- `LAUNCH_DIRECTORY_FILE`: local JSON file written by `npm run launch-directory:sync`
- `LAUNCH_PROFILE_LATITUDE`, `LAUNCH_PROFILE_LONGITUDE`: optional probe point used for launch-area Open States geo matching in the launch-directory snapshot

For production, use unique random values for `ADMIN_API_KEY`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, `ACTIVE_LOOKUP_COOKIE_SECRET`, `ADDRESS_CACHE_ENCRYPTION_KEY`, and `CONTACT_ADDRESS_SESSION_SECRET`. The front-end and back-end must share the same `ADMIN_API_KEY`. Keep every secret in the server environment only and do not reuse values across purposes. Admin MFA TOTP secrets are stored as per-account authenticated ciphertext in the admin database; keep the encryption key separate from database files, snapshots, and backups.
The public browser should call `/api/admin/*` on the Nuxt origin only. Those requests must terminate at the Nuxt server so the session cookie and server-held `ADMIN_API_KEY` stay inside the bridge layer.
Optional ballot-content provider URLs must be valid HTTPS URLs in production when set. Missing optional providers are allowed, but one-sided key/endpoint setups are flagged by `npm run verify:production` so pending paid or partner integrations do not look active by accident.

## Deploy-time stale-client recovery

Ballot Clarity now protects users who keep a tab open across deploys:

- SSR HTML exposes a public build id in the document shell.
- The client compares its own build id to the server-rendered build id during startup.
- If a stale client tries to hydrate a newer deploy, the app forces one safe reload instead of continuing into chunk 404s and hydration drift.
- Dynamic import and route-chunk failures that look like stale `_nuxt` asset misses also trigger the same one-time reload path.

Caching expectations:

- HTML responses should be revalidated aggressively and now send `Cache-Control: public, max-age=0, must-revalidate`.
- Hashed `_nuxt` assets remain immutable and now send `Cache-Control: public, max-age=31536000, immutable`.

If you want zero-disruption deploys beyond that, keep the previous `_nuxt` asset set available briefly after each release or switch traffic only after both the previous and new asset sets are accessible. That part is deployment infrastructure, not an app-shell setting.

## Useful npm commands

```bash
npm run dev
npm run server
npm run db:up
npm run env:local
npm run stack:up
npm run coverage:seed-local
npm run coverage:fulton-reviewed
npm run bootstrap-admin
npm run ingest:coverage -- --from-file ./ops/live-coverage.json
npm run -w back-end manage:coverage -- promote --from ./ops/reviewed-coverage.json --target "$LIVE_COVERAGE_FILE"
npm run launch-directory:sync
npm run providers:test
npm run verify:production
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
npm run serve
npm run preview
```

## Public product structure

Canonical public discovery pages:

- `/`: homepage and address lookup entry
- `/about`
- `/help`
- `/coverage`
- `/status`
- `/corrections`
- `/methodology`
- `/neutrality`
- `/data-sources`
- `/accessibility`
- `/privacy`
- `/terms`
- `/contact`
- `/locations/:slug`
- `/elections/:slug`
- `/districts`
- `/districts/:slug`
- `/representatives`
- `/contest/:slug`
- `/candidate/:slug`
- `/candidate/:slug/funding`
- `/candidate/:slug/influence`
- `/measure/:slug`
- `/sources`
- `/sources/:id`

Public guide and utility pages:

- `/ballot/:slug`: printable ballot guide and contest-reading surface
- `/search`: full-site search across elections, candidates, measures, and source records
- `/compare`: side-by-side comparison surface
- `/plan`: saved ballot plan and print checklist

These guide and utility pages are public, but they are treated as app-like surfaces rather than canonical discovery pages. They are not included in the sitemap, and the Nuxt app marks them `noindex`.

Experimental public routes:

- None are shipped as standalone public routes in the current release.
- Future-analysis modules may appear inside public pages when clearly labeled, but unfinished features should not be exposed as top-level navigation targets.

## Admin and editorial operations

Internal operations routes:

- `/admin/login`
- `/admin`
- `/admin/review`
- `/admin/content`
- `/admin/content/:id`
- `/admin/corrections`
- `/admin/sources`
- `/admin/audit`
- `/admin/users`

How the admin model works:

- Admin and editor accounts are persisted in the configured operational database, not hardcoded deployment credentials.
- The browser authenticates against Nuxt server routes, which issue a same-origin session cookie.
- Nuxt proxies protected admin requests to the Express API using `ADMIN_API_KEY`, so the backend key never reaches the browser.
- Browser traffic for `/api/admin/*` is expected to terminate at Nuxt. The Express admin endpoints are internal API surfaces behind `ADMIN_API_BASE`, not public browser routes.
- Admins can create, disable, restore, reset temporary passwords, and reset MFA enrollment for admin/editor accounts. Signed-in admins and editors can enable or disable app-based TOTP MFA and change their own passwords from the Account page. Disabled accounts cannot start new sessions, and password/MFA changes invalidate existing sessions by rotating the account credential timestamp checked by the Nuxt admin bridge.
- Roles are immutable after account creation: promotion or demotion requires creating a replacement account with the intended role and disabling the old account. The database prevents disabling the final active admin, and administrative recovery cannot target the operator's own current account.
- Publishing, unpublishing, live-content changes, content rollback, source-health mutations, and account creation/recovery require an admin session that completed MFA. Editors retain draft/review work but cannot mutate live content or perform publication and account-management actions.
- Content approver and guide-package reviewer identities are derived from the current authenticated account rather than accepted from browser input. Unpublishing a guide package requires a reason, returns it to review, and requires fresh reviewer signoff before another publication.
- Public correction submissions enter a private `new` intake state. Promotion into `triaged`, `researching`, or `resolved`, later public edits, and demotion back to private intake require an MFA-enabled admin and are recorded in the immutable audit trail; reporter identity is never returned by the public corrections API.
- The admin dashboard includes an account-security summary from `/api/admin/overview`, showing active admin-portal users, MFA-enabled users, and active accounts that still need MFA. The summary never exposes stored TOTP secrets.
- Admin data includes content publish state, reviewer approval metadata, persisted public-summary overrides, content history and rollback points, correction intake with content-record linkage, source-health monitoring, activity logs, user management, and a hash-chained append-only audit trail for critical publish/account actions.

## API surface

Public API endpoints:

- `POST /api/location`
- `GET /api/elections`
- `GET /api/jurisdictions`
- `GET /api/jurisdictions/:slug`
- `GET /api/ballot`
- `GET /api/coverage`
- `GET /api/status`
- `GET /api/corrections`
- `GET /api/contests/:slug`
- `GET /api/candidates/:slug`
- `GET /api/measures/:slug`
- `GET /api/compare`
- `GET /api/search`
- `GET /api/sources`
- `GET /api/sources/:id`
- `POST /api/feedback`
- `GET /api/data-sources`

Protected admin API endpoints:

These endpoints live on the Express service, but they are intended to be reached by the Nuxt admin bridge, not by the public browser directly.

- `POST /api/admin/auth/login`
- `GET /api/admin/auth/session/:username`
- `POST /api/admin/auth/password`
- `POST /api/admin/auth/mfa/setup`
- `POST /api/admin/auth/mfa/enable`
- `POST /api/admin/auth/mfa/disable`
- `GET /api/admin/overview`
- `GET /api/admin/audit`
- `GET /api/admin/review`
- `GET /api/admin/content`
- `GET /api/admin/content/:id/history`
- `POST /api/admin/content/:id/rollback`
- `PATCH /api/admin/content/:id`
- `GET /api/admin/corrections`
- `PATCH /api/admin/corrections/:id`
- `GET /api/admin/sources`
- `PATCH /api/admin/sources/:id`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`

## Architecture choices

- Front-end stack: Nuxt 4, Vite, TypeScript, UnoCSS, Pinia, file-based routing, layouts, composables, and `<script setup>`
- Back-end stack: Express plus a Postgres-first operations layer with a SQLite fallback
- Back-end persistence: Postgres for production and multi-instance deployments, with SQLite available only as a fallback for constrained local/dev setups
- State model: public civic state lives in `front-end/src/stores/civic.ts`, including selected location, election context, compare list, and saved ballot plan
- Content flow: public pages consume the Express API instead of embedding content directly in page files
- Search and sourcing: every major reading surface links to the source directory and source detail pages
- Trust layer: freshness, methodology, corrections, neutrality, and source authority are modeled explicitly in the data layer and rendered in the UI
- Admin model: persisted users, content status/history/rollback, correction queue with content-record linkage, source-health tracking, and immutable audit events all live behind a protected internal surface
- Coverage runtime: the public API starts in empty coverage mode by default and only serves local-guide data from an intentionally imported snapshot
- Snapshot provenance: public health, coverage, and status responses expose whether the active snapshot is seed, reviewed, production-approved, or unknown without exposing server filesystem paths
- Launch strategy: Fulton County, Georgia is the first production jurisdiction, currently published as an official-logistics-only guide shell until verified local contest packaging is ready
- Asset delivery: mirrored source-document URLs can be rewritten to object storage or a CDN via `SOURCE_ASSET_BASE_URL`
- Observability: the backend emits structured request logs, health metadata, and admin-auth throttle events
- Production roadmap: see `docs/production-readiness-roadmap.md` for the staged path from fixture-backed development data to a real operated civic-information service
- Live-data sequence: see `docs/live-data-implementation-sequence.md` for the concrete schema, env, provider, and rollout order for replacing fixture coverage with reviewed civic data
- Launch brief: see `docs/fulton-county-ga-launch.md` for the selected official systems and provider stack

## Production mode

- Set `NUXT_PUBLIC_SITE_URL` to the final public origin so metadata, schema, and canonical URLs match the deployed domain.
- Set `NUXT_PUBLIC_API_BASE` to the public API origin used by the browser.
- Set `NUXT_PUBLIC_OPERATOR_LEGAL_NAME`, `NUXT_PUBLIC_GOVERNING_LAW`, and `NUXT_PUBLIC_VENUE` so the public Terms and Privacy pages publish explicit production policy details instead of relying on defaults.
- Set `ADMIN_API_BASE` to the server-side admin API origin the Nuxt server can reach privately.
- Set `ADMIN_API_KEY`, `ADMIN_SESSION_SECRET`, and `ADMIN_MFA_ENCRYPTION_KEY` in the server environments only.
- Set unique `ACTIVE_LOOKUP_COOKIE_SECRET` and `ADDRESS_CACHE_ENCRYPTION_KEY` values in the backend server environment.
- Set `CONTACT_ADDRESS` and `CONTACT_ADDRESS_SESSION_SECRET` so the public contact route does not fall back to built-in local-development defaults.
- Use `ADMIN_STORE_DRIVER=postgres` together with `ADMIN_DATABASE_URL` for production. SQLite should only be used as a fallback for constrained local or temporary environments.
- Set `SOURCE_ASSET_BASE_URL` when mirrored source documents should resolve to object storage or a CDN instead of files bundled under `front-end/public/source-files/`.
- Import or promote a vetted snapshot with `npm run ingest:coverage` or `npm run -w back-end manage:coverage -- promote`. Set `LIVE_COVERAGE_FILE` to the active snapshot path and `LIVE_COVERAGE_REQUIRED=true` once production should refuse to start without current snapshot data.
- Do not promote a seed snapshot to production. Use `npm run coverage:fulton-reviewed` for the current reviewed Fulton official-logistics-only artifact, or promote a separately reviewed production-approved snapshot with a matching `.meta.json` sidecar.
- Run `npm run verify:production` against the active server environment before treating a deploy as production-ready. See `docs/production-config-check.md`.
- Run `npm run bootstrap-admin` once on the server, then remove the bootstrap password from routine shell history and secrets tooling if a different operational process is preferred.
- Keep the public reverse proxy pointed at Nuxt for `/api/admin/*`; do not route those browser requests straight to the Express backend.

## Local operator runbook

1. `npm run env:local`
2. Fill `GOOGLE_CIVIC_API_KEY` in `.env` if you want live address verification.
3. `npm run stack:up`
4. `npm run coverage:seed-local`
5. `npm run bootstrap-admin`
6. `npm run server`
7. `npm run dev`

Useful local URLs:

- public site: `http://127.0.0.1:3333`
- API health: `http://127.0.0.1:3001/health`
- local source-file bucket: `http://127.0.0.1:9000/source-files`
- MinIO console: `http://127.0.0.1:9001`

Local stack notes:

- Postgres is the actual local admin/editor persistence layer.
- MinIO is only needed when you want to test `SOURCE_ASSET_BASE_URL` against object-storage-style URLs. If you leave `SOURCE_ASSET_BASE_URL` blank, the app will continue using bundled static files under `front-end/public/source-files/`.
- Monitoring and scheduled imports are not separate local services yet because the current repo does not have a runtime monitor/worker subsystem to stand up. Health and provider readiness are exposed through `/health`, and coverage imports are still operator-triggered CLI commands.

## Publishing reviewed coverage snapshots

1. Normalize upstream civic data into the snapshot shape used by `back-end/src/coverage-repository.ts`.
2. Attach a metadata sidecar at `<snapshot>.meta.json` with `status`, `sourceType`, `sourceLabel`, and review or approval timestamps.
3. Validate that reviewed and production-approved snapshots do not contain seeded, staged-reference, or mixed guide content.
4. Promote the candidate snapshot with `npm run -w back-end manage:coverage -- promote --from <candidate-snapshot.json> --target "$LIVE_COVERAGE_FILE"`. Promotion re-validates publication eligibility, stages the snapshot and metadata sidecar together, and replaces the data before the approval metadata so older content is never paired with newer approval state.
5. Verify `/health`, `/api/coverage`, `/api/status`, `/api/elections`, `/api/guide-packages/:id`, `/ballot/:slug`, and a representative lookup after restart or reload.
6. Keep the public response contracts stable in the backend so the Nuxt composables and pages do not need to change.
7. Replace bundled source files with object storage or CDN delivery behind `SOURCE_ASSET_BASE_URL` when source-file scale requires it.
8. Keep the admin store as the operational layer for publish status, corrections, source monitoring, and editorial overrides even after the read-side data becomes fully provider-fed.

## Server-side provisioning after merge

1. Provision separate public and admin-capable server environments for the Nuxt front end and Express API.
2. Set `NUXT_PUBLIC_SITE_URL`, `NUXT_PUBLIC_API_BASE`, `NUXT_PUBLIC_OPERATOR_LEGAL_NAME`, `NUXT_PUBLIC_GOVERNING_LAW`, `NUXT_PUBLIC_VENUE`, `ADMIN_API_BASE`, `ADMIN_API_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_MFA_ENCRYPTION_KEY`, `ACTIVE_LOOKUP_COOKIE_SECRET`, `ADDRESS_CACHE_ENCRYPTION_KEY`, `CONTACT_ADDRESS`, `CONTACT_ADDRESS_SESSION_SECRET`, and either `ADMIN_DATABASE_URL` or `ADMIN_DB_PATH`.
3. Choose the admin store mode:
   Set `ADMIN_STORE_DRIVER=postgres` plus `ADMIN_DATABASE_URL` for managed Postgres. Use SQLite only if there is a deliberate single-instance fallback reason, and then create the directory that will hold the SQLite file referenced by `ADMIN_DB_PATH`, with backup and restore procedures in place.
4. Run `npm run bootstrap-admin` once to create the first persisted admin account.
5. Import or promote the first vetted coverage snapshot, then enable `LIVE_COVERAGE_REQUIRED=true` when the environment should fail closed without current snapshot data.
6. Configure `SOURCE_ASSET_BASE_URL` when source files should resolve to object storage or a CDN instead of bundled static files.
7. Put the API behind HTTPS and a reverse proxy or platform ingress that sends public `/api/admin/*` traffic to Nuxt, while the Nuxt server reaches the Express admin API over `ADMIN_API_BASE`.
8. Ensure the backend deploy artifact passes its built-in runtime import and asset check. The build copies both admin schemas and the live-data schema, then rejects any missing compiled relative import before deployment.
9. Configure log drains, alerts, and request-ID propagation in the platform so structured backend logs are actually usable during incidents.
10. Run `npm run verify:production` in the active environment and resolve every error before marking the deploy ready.

## Notes

- Ballot Clarity is informational only. It does not recommend candidates, measures, or voting choices.
- Fulton County, Georgia is the current launch jurisdiction. Official election resources and representative lookup are active; verified Fulton contest, candidate, and measure packaging remains unavailable until reviewed local records are loaded.
- Time-sensitive election logistics should always be checked against official election-office notices.
- Light mode is the default, dark mode is supported, and ballot pages are designed to print cleanly.

## License and attribution

Ballot Clarity source code is distributed under the MIT license in `LICENSE`. The project originally used the Vitesse Nuxt starter as a foundation; retained third-party attribution is documented in `NOTICE.md`.
