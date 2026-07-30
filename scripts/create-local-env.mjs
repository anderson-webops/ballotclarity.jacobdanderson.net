import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
const force = process.argv.includes("--force");

function randomSecret(bytes = 24) {
	return randomBytes(bytes).toString("hex");
}

if (existsSync(envPath) && !force) {
	console.log(`Local .env already exists at ${envPath}. Use npm run env:local -- --force to overwrite it.`);
	process.exit(0);
}

const postgresUser = "postgres";
const postgresPassword = "postgres";
const postgresDb = "ballot_clarity";
const postgresPort = "5432";
const minioRootUser = "minioadmin";
const minioRootPassword = randomSecret(18);
const minioBucket = "source-files";
const minioPort = "9000";
const minioConsolePort = "9001";

const content = `# Local developer environment for Ballot Clarity
# Fill GOOGLE_CIVIC_API_KEY before testing live address verification.

# Public runtime values
NUXT_PUBLIC_SITE_URL=http://127.0.0.1:3333
NUXT_PUBLIC_API_BASE=http://127.0.0.1:3001/api

# Local infrastructure
POSTGRES_DB=${postgresDb}
POSTGRES_USER=${postgresUser}
POSTGRES_PASSWORD=${postgresPassword}
POSTGRES_PORT=${postgresPort}
MINIO_ROOT_USER=${minioRootUser}
MINIO_ROOT_PASSWORD=${minioRootPassword}
MINIO_BUCKET=${minioBucket}
MINIO_PORT=${minioPort}
MINIO_CONSOLE_PORT=${minioConsolePort}

# Server-only admin bridge values
ADMIN_API_BASE=http://127.0.0.1:3001/api
ADMIN_API_KEY=${randomSecret(24)}
ADMIN_SESSION_SECRET=${randomSecret(24)}
ADMIN_MFA_ENCRYPTION_KEY=${randomSecret(32)}
ACTIVE_LOOKUP_COOKIE_SECRET=${randomSecret(32)}
ADDRESS_CACHE_ENCRYPTION_KEY=${randomSecret(32)}
ADMIN_STORE_DRIVER=postgres
ADMIN_DATABASE_URL=postgres://${postgresUser}:${postgresPassword}@127.0.0.1:${postgresPort}/${postgresDb}

# Server-only protected contact email values
CONTACT_ADDRESS=hello@ballotclarity.org
CONTACT_ADDRESS_SESSION_SECRET=${randomSecret(24)}

# Public source-asset delivery
SOURCE_ASSET_BASE_URL=http://127.0.0.1:${minioPort}/${minioBucket}

# One-time bootstrap values for the first persisted admin account
ADMIN_BOOTSTRAP_USERNAME=founder-admin
ADMIN_BOOTSTRAP_PASSWORD=${randomSecret(18)}
ADMIN_BOOTSTRAP_DISPLAY_NAME=Ballot Clarity Admin
ADMIN_BOOTSTRAP_ROLE=admin

# Civic and AI provider keys
# Census geocoding does not require an API key.
# DATA_API_KEY can be reused for Congress.gov and OpenFEC if you do not want separate keys.
GOOGLE_CIVIC_API_KEY=
GOOGLE_CIVIC_FORCE_IPV4=false
DATA_API_KEY=
CONGRESS_API_KEY=
OPENFEC_API_KEY=
OPENSTATES_API_KEY=
LDA_API_KEY=
OPENAI_API_KEY=
CENSUS_GEOCODER_BENCHMARK=Public_AR_Current
CENSUS_GEOCODER_VINTAGE=Current_Current
LAUNCH_DIRECTORY_FILE=./data/launch-directory.local.json
LAUNCH_PROFILE_LATITUDE=33.7490
LAUNCH_PROFILE_LONGITUDE=-84.3880

# Imported coverage snapshots
LIVE_COVERAGE_FILE=./data/live-coverage.local.json
LIVE_COVERAGE_REQUIRED=false

# Back-end runtime
PORT=3001
TRUST_PROXY=false
LOG_LEVEL=info
ADMIN_LOGIN_WINDOW_MS=900000
ADMIN_LOGIN_MAX_ATTEMPTS=5
ADMIN_LOGIN_LOCKOUT_MS=1800000
`;

writeFileSync(envPath, content, "utf8");
console.log(`Created local .env at ${envPath}. Fill GOOGLE_CIVIC_API_KEY before testing live address verification.`);
