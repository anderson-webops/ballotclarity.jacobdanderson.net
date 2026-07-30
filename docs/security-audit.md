# Security Audit

Ballot Clarity uses a zero-exception vulnerability gate and a deny-by-default administrative model. This document records the application, workflow, backend, system, and dependency review completed on 2026-07-30.

## Authorization and workflow matrix

| Capability                                                                     | Editor                                | Admin without enrolled MFA            | Admin with enrolled MFA               |
| ------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------- | ------------------------------------- |
| Read editorial queues, draft content, corrections, packages, and source status | Allowed                               | Allowed                               | Allowed                               |
| Edit unpublished draft content and new correction intake                       | Allowed                               | Allowed                               | Allowed                               |
| View users or the immutable audit trail                                        | Denied                                | Allowed                               | Allowed                               |
| Publish, unpublish, roll back, or modify live content                          | Denied                                | Denied                                | Allowed                               |
| Publish or unpublish a guide package                                           | Denied                                | Denied                                | Allowed                               |
| Change monitored source state                                                  | Denied                                | Denied                                | Allowed                               |
| Create, disable, restore, reset, or recover another account                    | Denied                                | Denied                                | Allowed                               |
| Change an existing account role                                                | Denied                                | Denied                                | Denied; create a replacement account  |
| Change the authenticated account's own password or MFA                         | Self-service with current credentials | Self-service with current credentials | Self-service with current credentials |

Administrative requests require both the server-held internal API key and a current signed delegated session. The backend re-reads the persisted user before every protected request and requires exact agreement on username, display name, role, credential revision, MFA state, password-rotation state, and enabled state. Password, MFA, disable, and restore changes rotate the credential revision and invalidate prior sessions.

Temporary administrator-issued passwords block every non-read administrative mutation except the authenticated user's own password change. Administrative recovery cannot target the acting administrator. The last active administrator cannot be disabled; SQLite uses an immediate transaction and Postgres takes the required lock so concurrent requests cannot bypass this invariant.

Guide publication requires an authenticated administrator with enrolled MFA, a saved reviewer identity from the session, a publish-ready recommendation, passing package diagnostics, and explicit promotion from `ready_to_publish`. Unpublishing requires a reason and returns the package to review with a fresh reviewer record. Editors cannot change live content, publication controls, public corrections, monitored sources, users, roles, or the audit trail.

## Remediated findings

- Replaced trusted client-supplied actor headers with signed, server-delegated sessions and persisted-user revalidation.
- Required MFA enrollment for all high-impact publication, rollback, source, and account workflows.
- Made account mutations transactional and protected the last active administrator under concurrent requests.
- Encrypted MFA seeds and cached address payloads with dedicated authenticated-encryption secrets; address lookup keys are keyed hashes rather than plaintext.
- Added forced password rotation for administrator-issued credentials, bounded credential fields, constant-time API-key and session-signature checks, and session invalidation on every credential-state change.
- Added a standardized coarse per-connection limiter across every private admin API request, backed by a bounded fail-closed store, plus independent stricter account and network-address throttles for login, password, and MFA verification.
- Added strict same-origin mutation checks at the Nuxt bridge, secure `HttpOnly`/`SameSite=Strict` production cookies, private/no-store admin responses, restrictive CORS, and browser security headers.
- Enforced script CSP with per-response hashes for only the known Nuxt and Ballot Clarity bootstrap scripts. The inline-script scanner handles HTML whitespace and malformed closing tags conservatively and fails closed on ambiguous nesting. Unknown inline scripts remain blocked; production API connectivity is restricted to the configured runtime origin.
- Added strict JSON content types and 64 KiB body ceilings at both public Express and private Nuxt server boundaries.
- Bounded public feedback, civic lookup, protected-contact, saved lookup, and direct provider-backed representative requests; all in-memory bucket maps fail closed at capacity.
- Added deadlines and a 5 MiB decoded-body ceiling to every civic-provider response, including the custom IPv4 Google transport.
- Added bounded TTL/LRU caches for representative enrichment and direct representative identity lookups.
- Limited encrypted Postgres address-cache retention to seven days and the newest 100,000 rows by default.
- Restricted optional exact-ZIP event logging to ZIP-only metadata, serialized writes, a 10 MiB active file plus one backup, and `0700` directory/`0600` file permissions.
- Required an explicit trusted-proxy provenance assertion before proxy geography headers can enable automatic location guessing. The edge must remove client-supplied copies before writing those headers.
- Rejected unsafe remote coverage destinations and redirects, bounded coverage downloads, sanitized public links and structured data, and kept unreviewed or unpublished election content out of public routes.
- Aligned local, CI, and package metadata on Node 24.18.0 LTS with npm 11.16.0; optional native packages are installed and checked on Linux ARM64.
- Replaced Nitro's vulnerable Archiver 7 dependency path with a tested local compatibility bridge backed by Archiver 8.
  The bridge has a semver-compatible local identity and its exact source remains pinned by repository tests.
- Made the backend incremental compiler cache part of the disposable build output and added a post-build import-closure check so a stale cache cannot produce an incomplete deploy artifact.
- Made local `.env` generation exclusive and symlink-safe, with owner-only permissions and atomic replacement for an explicit `--force`; local setup and verification commands no longer print environment-derived paths or values.
- Replaced provider-derived slug regular expressions with a bounded single-pass normalizer and structured launch-directory logging with control-character removal.
- Pinned CI actions by commit, disabled persisted checkout credentials, required SHA-pinned Actions at the repository
  level, updated Qodana to the current reviewed action, added CodeQL plus zero-exception full, production, and registry
  signature audits, enabled Dependabot alerts/security updates, secret scanning with push protection, and private
  vulnerability reporting, and kept install-script approvals explicit.
- Refreshed the compatible Antfu ESLint, Puppeteer, Nuxt, and Vite toolchain. The full dependency graph now resolves
  optional peers without invalid attachments while retaining Node 24 type definitions and TypeScript 6 for the
  production runtime and supported parser boundary.
- Replaced fixed native-binding paths with lockfile-driven discovery that verifies every GNU and musl Linux ARM64
  optional package, including Oxfmt and Rollup, at the exact parent dependency version.

## Code-scanning interpretation

Three precise CodeQL false-positive dispositions document cryptographic uses that are safe but are not distinguishable from credential handling through field-name taint alone:

- The two SHA-256 findings in the SQLite and Postgres admin stores link immutable audit records into a tamper-evident chain. They do not hash passwords; account passwords use scrypt.
- The saved nationwide-lookup cookie sink receives only authenticated ciphertext returned by the dedicated secret-envelope function. Raw address input is excluded from the compact cookie payload and is never passed to the cookie writer.

All other findings from the security-extended scan are remediated in executable source or tests rather than dismissed in the repository dashboard.

## Production operator requirements

- Use Postgres rather than the SQLite fallback for a multi-instance or production deployment.
- Set unique, high-entropy values for every documented secret. Do not reuse the admin API key, session secret, MFA encryption key, active-lookup cookie secret, address-cache encryption key, or protected-contact secret.
- Keep the Express API and database on private interfaces. Set `TRUST_PROXY` only to the actual reverse proxy; never use broad `true` trust.
- If `LOCATION_GUESS_MODE=proxy_headers`, configure the trusted edge to strip incoming geography headers, overwrite them from trusted edge metadata, and only then set `LOCATION_GUESS_PROXY_HEADERS_TRUSTED=true`.
- Keep provider keys server-side and restrict them by API, origin/IP, quota, and billing policy where the provider supports those controls.
- Publish only a production-approved live coverage snapshot and run `npm run verify:production` against the actual production environment before restart or promotion.
- Treat deployment, backup/restore, secret rotation, database access, reverse-proxy configuration, and live smoke verification as operator controls outside the source tree.

## Release gate

Every release must pass all of the following from a clean lockfile install:

```bash
npm ci --include=optional
npm run verify:backend-lockfile
npm run verify:native-bindings
npm run audit:raw
npm run audit:production
npm run audit
npm run audit:signatures
npm run lint
npm run typecheck
npm run test
npm run verify:production:fixture
npm run build
npm run verify:analytics
npm run test:e2e
npm run a11y
```

- `npm run audit:raw` checks the complete workspace dependency graph, including development tooling.
- `npm run audit:production` checks the deployment graph with development dependencies omitted.
- `npm run audit` is the repository's testable zero-exception CI wrapper.
- `npm run audit:signatures` verifies registry signatures and available provenance attestations for the installed graph;
  the small local Archiver bridge is separately pinned and behavior-tested in source.
- Strict install-script policy makes the root and standalone-backend clean installs fail if a dependency lifecycle script is not explicitly approved or denied.
- Standalone backend-lockfile verification prevents the secondary deployment lockfile from drifting behind its manifest.
- Native-binding verification and the ARM64 CI job prevent platform optional packages from silently disappearing from the lockfile.

There are no advisory exceptions. If an upstream chain cannot be remediated safely, the release remains blocked until a supported dependency path is available or the dependency is replaced.

## Install-script approvals

The root and standalone-backend manifests use npm's `allowScripts` policy so install-time scripts are explicitly reviewed. Native or platform setup packages are approved by exact version. Puppeteer's install script is denied because browser checks use an explicit or system Chrome instead of downloading one during installation. The repository `.npmrc` and standalone verification command enable `strict-allow-scripts`, so an unreviewed script blocks clean installation.

Any newly pending package must be reviewed and explicitly approved or denied before release.
