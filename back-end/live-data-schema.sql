CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS jurisdictions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	name TEXT NOT NULL,
	display_name TEXT NOT NULL,
	state TEXT NOT NULL,
	jurisdiction_type TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS elections (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	jurisdiction_id UUID NOT NULL REFERENCES jurisdictions(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	election_date DATE NOT NULL,
	status TEXT NOT NULL DEFAULT 'draft',
	coverage_mode TEXT NOT NULL DEFAULT 'reference',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contests (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
	office TEXT NOT NULL,
	contest_type TEXT NOT NULL CHECK (contest_type IN ('candidate', 'measure')),
	jurisdiction_level TEXT NOT NULL,
	upstream_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS candidates (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	display_name TEXT NOT NULL,
	party TEXT,
	incumbent BOOLEAN NOT NULL DEFAULT FALSE,
	upstream_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contest_candidates (
	contest_id UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
	candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
	sort_order INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (contest_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS measures (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	slug TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	ballot_title TEXT,
	election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
	contest_id UUID REFERENCES contests(id) ON DELETE SET NULL,
	upstream_id TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_records (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	source_key TEXT NOT NULL UNIQUE,
	title TEXT NOT NULL,
	publisher TEXT NOT NULL,
	source_type TEXT NOT NULL,
	authority TEXT NOT NULL,
	source_system TEXT NOT NULL,
	source_url TEXT NOT NULL,
	published_at DATE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_snapshots (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
	content_hash TEXT NOT NULL,
	captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	http_status INTEGER,
	mime_type TEXT,
	notes TEXT
);

CREATE TABLE IF NOT EXISTS source_artifacts (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	source_snapshot_id UUID NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
	storage_key TEXT NOT NULL UNIQUE,
	public_url TEXT,
	byte_size BIGINT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS citation_links (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	source_record_id UUID NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
	entity_type TEXT NOT NULL,
	entity_id UUID NOT NULL,
	context_label TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS address_lookups (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	input_hash TEXT NOT NULL UNIQUE,
	encrypted_payload TEXT,
	expires_at TIMESTAMPTZ,
	normalized_address TEXT,
	zip5 TEXT,
	state TEXT,
	county_fips TEXT,
	latitude DOUBLE PRECISION,
	longitude DOUBLE PRECISION,
	census_benchmark TEXT,
	census_vintage TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS district_assignments (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	address_lookup_id UUID NOT NULL REFERENCES address_lookups(id) ON DELETE CASCADE,
	district_type TEXT NOT NULL,
	district_code TEXT NOT NULL,
	district_label TEXT NOT NULL,
	source_system TEXT NOT NULL,
	effective_date DATE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS content_revisions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_type TEXT NOT NULL,
	entity_id UUID NOT NULL,
	revision_kind TEXT NOT NULL,
	title TEXT,
	body JSONB NOT NULL DEFAULT '{}'::JSONB,
	created_by TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS publish_revisions (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_type TEXT NOT NULL,
	entity_id UUID NOT NULL,
	content_revision_id UUID REFERENCES content_revisions(id) ON DELETE SET NULL,
	published_by TEXT,
	published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	is_current BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS summary_generations (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	entity_type TEXT NOT NULL,
	entity_id UUID NOT NULL,
	model_name TEXT NOT NULL,
	source_set_hash TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'draft',
	prompt_version TEXT,
	output JSONB NOT NULL DEFAULT '{}'::JSONB,
	reviewed_by TEXT,
	reviewed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elections_jurisdiction_id ON elections(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_contests_election_id ON contests(election_id);
CREATE INDEX IF NOT EXISTS idx_measures_election_id ON measures(election_id);
CREATE INDEX IF NOT EXISTS idx_source_snapshots_source_record_id ON source_snapshots(source_record_id);
CREATE INDEX IF NOT EXISTS idx_citation_links_source_record_id ON citation_links(source_record_id);
CREATE INDEX IF NOT EXISTS idx_citation_links_entity ON citation_links(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_district_assignments_lookup_id ON district_assignments(address_lookup_id);
CREATE INDEX IF NOT EXISTS idx_content_revisions_entity ON content_revisions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_publish_revisions_entity ON publish_revisions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_summary_generations_entity ON summary_generations(entity_type, entity_id);
