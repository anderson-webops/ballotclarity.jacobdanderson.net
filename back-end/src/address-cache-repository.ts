import type { CensusAddressLookupResult } from "./census-geocoder.js";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { openSecretJson, sealSecretJson } from "./secret-envelope.js";

export interface CachedAddressLookup extends CensusAddressLookupResult {
	fromCache: true;
}

export interface AddressCacheRepository {
	driver: "none" | "postgres";
	getByInput: (input: string) => Promise<CachedAddressLookup | null>;
	save: (input: string, lookup: CensusAddressLookupResult) => Promise<void>;
}

interface AddressLookupRow {
	encrypted_payload: string | null;
	id: string;
}

const packagedSchemaPath = new URL("./live-data-schema.sql", import.meta.url);
const sourceSchemaPath = new URL("../live-data-schema.sql", import.meta.url);
const addressCacheEncryptionPurpose = "ballot-clarity:address-cache:v1";
const addressCacheHashPurpose = "ballot-clarity:address-cache-input:v1";
const addressCacheRetentionMs = 7 * 24 * 60 * 60 * 1000;
export const defaultAddressCacheMaxRows = 100_000;

export function normalizeAddressCacheInput(input: string) {
	return input.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hashAddressCacheInput(input: string, secret: string) {
	if (!secret.trim())
		throw new Error("Address cache encryption key is required.");

	return createHmac("sha256", secret)
		.update(`${addressCacheHashPurpose}\0${normalizeAddressCacheInput(input)}`)
		.digest("hex");
}

export function resolveAddressCacheMaxRows(
	value: number | string | null | undefined = process.env.ADDRESS_CACHE_MAX_ROWS,
	fallback = defaultAddressCacheMaxRows,
) {
	const parsed = typeof value === "number" ? value : Number(value);
	const normalized = Math.floor(parsed);

	return Number.isSafeInteger(normalized) && normalized > 0
		? normalized
		: fallback;
}

function resolveSchemaPath() {
	const packagedPathname = fileURLToPath(packagedSchemaPath);

	if (existsSync(packagedPathname))
		return packagedPathname;

	return fileURLToPath(sourceSchemaPath);
}

function mapCachedLookup(row: AddressLookupRow, encryptionKey: string): CachedAddressLookup {
	if (!row.encrypted_payload)
		throw new Error("Encrypted address cache record is missing.");

	const lookup = openSecretJson<CensusAddressLookupResult>(
		row.encrypted_payload,
		encryptionKey,
		addressCacheEncryptionPurpose
	);

	if (
		!lookup
		|| typeof lookup.benchmark !== "string"
		|| typeof lookup.normalizedAddress !== "string"
		|| typeof lookup.vintage !== "string"
		|| !Array.isArray(lookup.districtMatches)
	) {
		throw new Error("Encrypted address cache record is invalid.");
	}

	return {
		...lookup,
		fromCache: true,
	};
}

async function createPostgresAddressCacheRepository(
	databaseUrl: string,
	encryptionKey: string,
	maxRows: number,
): Promise<AddressCacheRepository> {
	const pool = new Pool({
		connectionString: databaseUrl
	});

	await pool.query(readFileSync(resolveSchemaPath(), "utf8"));
	await pool.query(`
		ALTER TABLE address_lookups ADD COLUMN IF NOT EXISTS encrypted_payload TEXT;
		ALTER TABLE address_lookups ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
		ALTER TABLE address_lookups ALTER COLUMN normalized_address DROP NOT NULL;
		ALTER TABLE address_lookups ALTER COLUMN zip5 DROP NOT NULL;
		DELETE FROM address_lookups
		WHERE encrypted_payload IS NULL OR expires_at IS NULL;
		CREATE INDEX IF NOT EXISTS idx_address_lookups_expires_at ON address_lookups(expires_at);
		CREATE INDEX IF NOT EXISTS idx_address_lookups_updated_at ON address_lookups(updated_at DESC);
	`);

	return {
		driver: "postgres",
		async getByInput(input) {
			const inputHash = hashAddressCacheInput(input, encryptionKey);
			await pool.query("DELETE FROM address_lookups WHERE expires_at <= NOW()");
			const lookupResult = await pool.query<AddressLookupRow>(`
				SELECT id, encrypted_payload
				FROM address_lookups
				WHERE input_hash = $1 AND expires_at > NOW()
			`, [inputHash]);
			const row = lookupResult.rows[0];

			if (!row)
				return null;

			try {
				return mapCachedLookup(row, encryptionKey);
			}
			catch {
				await pool.query("DELETE FROM address_lookups WHERE id = $1", [row.id]);
				return null;
			}
		},
		async save(input, lookup) {
			const inputHash = hashAddressCacheInput(input, encryptionKey);
			const encryptedPayload = sealSecretJson(lookup, encryptionKey, addressCacheEncryptionPurpose);

			await pool.query("DELETE FROM address_lookups WHERE expires_at <= NOW()");
			await pool.query(`
				INSERT INTO address_lookups (
					input_hash,
					encrypted_payload,
					expires_at,
					normalized_address,
					zip5,
					state,
					county_fips,
					latitude,
					longitude,
					census_benchmark,
					census_vintage,
					updated_at
				) VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 millisecond'), NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NOW())
				ON CONFLICT (input_hash) DO UPDATE
				SET encrypted_payload = EXCLUDED.encrypted_payload,
					expires_at = EXCLUDED.expires_at,
					normalized_address = NULL,
					zip5 = NULL,
					state = NULL,
					county_fips = NULL,
					latitude = NULL,
					longitude = NULL,
					census_benchmark = NULL,
					census_vintage = NULL,
					updated_at = NOW()
			`, [inputHash, encryptedPayload, addressCacheRetentionMs]);
			await pool.query(`
				DELETE FROM address_lookups
				WHERE id IN (
					SELECT id
					FROM address_lookups
					ORDER BY updated_at DESC, id DESC
					OFFSET $1
				)
			`, [maxRows]);
		}
	};
}

export async function createAddressCacheRepository(
	databaseUrl = process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL || "",
	encryptionKey = process.env.ADDRESS_CACHE_ENCRYPTION_KEY || "",
	maxRows = resolveAddressCacheMaxRows(),
): Promise<AddressCacheRepository> {
	const resolvedDatabaseUrl = databaseUrl.trim();
	const resolvedEncryptionKey = encryptionKey.trim();

	if (!resolvedDatabaseUrl || !resolvedEncryptionKey) {
		return {
			driver: "none",
			async getByInput() {
				return null;
			},
			async save() {}
		};
	}

	return await createPostgresAddressCacheRepository(
		resolvedDatabaseUrl,
		resolvedEncryptionKey,
		resolveAddressCacheMaxRows(maxRows),
	);
}
