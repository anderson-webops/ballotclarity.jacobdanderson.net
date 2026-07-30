# Ballot Clarity Live Data Implementation Sequence

This document turns the production-readiness roadmap into the next concrete build order for this repo.

## Product rule first

- ZIP code lookup is approximate.
- Full street address is the input for exact district and ballot matching.
- Public UI should always say which mode the user is in.

## Manual provider setup

Prioritize these in this order:

1. Google Civic Information API
   - Use for voter info, polling places, early-vote locations, and sample-ballot verification where supported.
   - Setup: <https://developers.google.com/civic-information>
2. api.data.gov key
   - One key can be used for Congress.gov and OpenFEC.
   - Sign up: <https://api.data.gov/signup/>
   - Congress.gov signup page: <https://api.congress.gov/sign-up/>
   - OpenFEC docs: <https://api.open.fec.gov/developers/>
3. Open States API key
   - Use for state legislative normalization and `people.geo` lookups.
   - Setup: <https://docs.openstates.org/api-v3/>
4. LDA.gov API key
   - Use only if you want lobbying-enrichment pages.
   - Setup and terms: <https://lda.senate.gov/api/tos/>
5. OpenAI API
   - Use only for offline or admin-reviewed summary generation and extraction jobs.
   - Production guidance: <https://platform.openai.com/docs/guides/production-best-practices/model-overview>
   - Batch API: <https://platform.openai.com/docs/guides/batch/>

## Infrastructure you still need outside the repo

- Managed Postgres
- Object storage or CDN for mirrored source files
- Job runner or scheduler for imports and refresh checks
- Monitoring and alerting
- Secret management

The repo has code hooks for these. It does not provision the vendor accounts or hosted services for you.

## Env vars to add

Server-only:

- `GOOGLE_CIVIC_API_KEY`
- `CONGRESS_API_KEY`
- `OPENFEC_API_KEY`
- `OPENSTATES_API_KEY`
- `LDA_API_KEY`
- `OPENAI_API_KEY`

Already present and still required:

- `ADMIN_DATABASE_URL`
- `ADMIN_API_BASE`
- `ADMIN_API_KEY`
- `ADMIN_SESSION_SECRET`
- `ACTIVE_LOOKUP_COOKIE_SECRET`
- `ADDRESS_CACHE_ENCRYPTION_KEY`
- `SOURCE_ASSET_BASE_URL`
- `LIVE_COVERAGE_FILE`
- `LAUNCH_DIRECTORY_FILE`

## Exact schema additions

These should be added in Postgres before real national or multi-jurisdiction launch work:

### Lookup and geography

- `address_lookups`
  - `id`
  - `input_hash`
  - `encrypted_payload`
  - `expires_at`
  - `created_at`
  - `updated_at`

The input identifier is a keyed HMAC and the lookup result—including normalized geography and district assignments—is stored only in the authenticated encrypted payload. Cache records expire after 7 days; legacy plaintext lookup rows are removed during migration.

### Elections and contests

- `jurisdiction`
- `election`
- `contest`
- `candidate`
- `measure`
- `contest_candidate`
- `contest_measure`

Use stable internal ids plus upstream ids. Do not use display names as join keys.

### Sources and artifacts

- `source_record`
- `source_snapshot`
- `source_artifact`
- `citation_link`

Separate source metadata from mirrored files stored in object storage.

### Editorial and generated content

- `content_revision`
- `publish_revision`
- `summary_generation`
- `correction_link`

Store generated summaries separately from the canonical source records they were derived from.

A draft Postgres scaffold for these tables now lives in `back-end/live-data-schema.sql`.

## Provider adapters to build

Build them as isolated adapters, not one monolithic civic-data client:

1. `censusGeocoderAdapter`
   - address normalization
   - geographic lookup
   - benchmark and vintage capture
2. `googleCivicAdapter`
   - voter info lookup
   - polling-place and early-vote verification
   - election id handling
3. `fultonElectionOfficeAdapter`
   - official notices
   - contact info
   - calendar and logistics captures
4. `georgiaStateElectionAdapter`
   - My Voter Page linkouts and statewide calendar sync
5. `openStatesAdapter`
   - state legislative people and geography enrichment
6. `congressAdapter`
   - congressional member and bill context
7. `openFecAdapter`
   - federal finance enrichment
8. `ldaAdapter`
   - lobbying enrichment
9. `openAiSummaryWorker`
   - offline summary drafting only
   - cache by source-set hash
   - never execute on public page load

## Safest implementation order

1. Move the read-side public model into Postgres.
2. Add `address_lookup` and `district_assignment` tables.
3. Build Census-based address normalization and cached lookup.
4. Add Google Civic verification for exact voter info and polling flow.
5. Add official Fulton and Georgia election-office ingestion.
6. Add stable contest and source tables.
7. Add offline summary generation behind admin review.
8. Add OpenFEC and Congress.gov enrichment.
9. Add LDA only after the ballot and finance core is stable.

## Cost-control rules for AI

- No browser-side model calls.
- No public free-form chat over paid APIs.
- No regeneration on page load.
- Generate only in admin/background jobs.
- Cache by source-set hash and content revision.
- Use batch processing where possible.
- Require editorial review before publish.

## Immediate next repo steps

1. Keep ZIP lookup as approximate selection flow.
2. Add address-to-district caching table and service.
3. Add provider env wiring and secret loading for Google Civic, Open States, and api.data.gov keys.
4. Build one real Fulton County address lookup path end to end before expanding jurisdiction count.

## What is now implemented in-repo

- Full-address lookup can now enrich the response with Census geographies and Open States representative matches.
- When Postgres is configured, normalized address geography is cached in `address_lookups` and `district_assignments`.
- A launch-directory sync scaffold now exists to ingest Google Civic elections plus Congress and Open States representative records into a local JSON artifact.

## What still has to happen after this

- Move the public district and representative pages from seeded derivation onto the ingested launch-directory and later database-backed read model.
- Add deliberate candidate-to-committee and candidate-to-lobbying crosswalks before OpenFEC or LDA drive public funding or influence pages.
- Put scheduled sync around the launch-directory artifact and then replace the JSON artifact with first-class Postgres tables once the mapping stabilizes.
