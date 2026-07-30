import process from "node:process";
import { readProviderResponseJson } from "./fetch-response.js";
import { createFetchTimeoutSignal, resolveFetchTimeoutMs } from "./fetch-timeout.js";

export interface CongressMemberRecord {
	bioguideId: string;
	currentMember?: boolean;
	district?: number;
	name: string;
	party: string;
	state: string;
	updatedAt?: string;
	url?: string;
}

export interface CongressMemberDetail {
	addressInformation?: {
		city?: string;
		district?: string;
		officeAddress?: string;
		phoneNumber?: string;
		zipCode?: number;
	};
	bioguideId: string;
	cosponsoredLegislationCount?: number;
	cosponsoredLegislationUrl?: string;
	currentMember: boolean;
	depiction?: {
		attribution?: string;
		imageUrl: string;
	};
	district?: number;
	directOrderName: string;
	firstName?: string;
	lastName?: string;
	officialWebsiteUrl?: string;
	party: string;
	sponsoredLegislationCount?: number;
	sponsoredLegislationUrl?: string;
	state: string;
	terms: Array<{
		chamber: string;
		congress: number;
		district?: number;
		memberType?: string;
		startYear: number;
		endYear?: number;
		stateCode?: string;
		stateName?: string;
	}>;
	updatedAt?: string;
	url?: string;
}

export interface CongressClient {
	getMember: (bioguideId: string) => Promise<CongressMemberDetail | null>;
	listMembers: () => Promise<CongressMemberRecord[]>;
	listMembersByState: (stateCode: string) => Promise<CongressMemberRecord[]>;
}

interface CongressClientOptions {
	apiKey?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

interface CongressMembersResponse {
	members?: Array<{
		bioguideId?: string;
		district?: number;
		name?: string;
		partyName?: string;
		state?: string;
		terms?: {
			item?: Array<{
				endYear?: number;
				startYear?: number;
			}>;
		};
		updateDate?: string;
		url?: string;
	}>;
}

interface CongressMemberDetailResponse {
	member?: {
		addressInformation?: {
			city?: string;
			district?: string;
			officeAddress?: string;
			phoneNumber?: string;
			zipCode?: number;
		};
		bioguideId?: string;
		cosponsoredLegislation?: {
			count?: number;
			url?: string;
		};
		currentMember?: boolean;
		depiction?: {
			attribution?: string;
			imageUrl?: string;
		};
		district?: number;
		directOrderName?: string;
		firstName?: string;
		lastName?: string;
		officialWebsiteUrl?: string;
		partyHistory?: Array<{
			partyName?: string;
		}>;
		sponsoredLegislation?: {
			count?: number;
			url?: string;
		};
		state?: string;
		terms?: Array<{
			chamber?: string;
			congress?: number;
			district?: number;
			memberType?: string;
			startYear?: number;
			endYear?: number;
			stateCode?: string;
			stateName?: string;
		}>;
		updateDate?: string;
		url?: string;
	};
}

function deriveCurrentMemberFromTerms(
	terms: Array<{
		endYear?: number;
		startYear?: number;
	}> | undefined,
	currentYear = new Date().getUTCFullYear(),
) {
	if (!terms?.length)
		return undefined;

	return terms.some(term => typeof term.startYear === "number" && (typeof term.endYear !== "number" || term.endYear >= currentYear));
}

export function isCurrentCongressMemberRecord(member: CongressMemberRecord) {
	return member.currentMember !== false;
}

export function createCongressClient({
	apiKey = process.env.CONGRESS_API_KEY?.trim() || process.env.DATA_API_KEY?.trim(),
	fetchImpl = fetch,
	timeoutMs = resolveFetchTimeoutMs(process.env.CONGRESS_FETCH_TIMEOUT_MS),
}: CongressClientOptions = {}): CongressClient | null {
	const resolvedApiKey = apiKey?.trim();
	const resolvedTimeoutMs = resolveFetchTimeoutMs(timeoutMs);

	if (!resolvedApiKey)
		return null;

	return {
		async listMembers() {
			const members: CongressMemberRecord[] = [];
			const seen = new Set<string>();
			const limit = 250;

			for (let offset = 0; offset <= 2000; offset += limit) {
				const requestUrl = new URL("https://api.congress.gov/v3/member");
				requestUrl.searchParams.set("api_key", resolvedApiKey);
				requestUrl.searchParams.set("format", "json");
				requestUrl.searchParams.set("limit", String(limit));
				requestUrl.searchParams.set("offset", String(offset));

				const response = await fetchImpl(requestUrl, {
					headers: {
						Accept: "application/json"
					},
					signal: createFetchTimeoutSignal(resolvedTimeoutMs),
				});

				if (!response.ok)
					throw new Error(`Congress member lookup failed: ${response.status} ${response.statusText}`);

				const payload = await readProviderResponseJson<CongressMembersResponse>(response);
				const pageMembers = (payload.members ?? []).map(member => ({
					bioguideId: member.bioguideId?.trim() || "unknown-member",
					currentMember: deriveCurrentMemberFromTerms(member.terms?.item),
					district: member.district,
					name: member.name?.trim() || "Unknown member",
					party: member.partyName?.trim() || "Unknown party",
					state: member.state?.trim() || "",
					updatedAt: member.updateDate?.trim() || undefined,
					url: member.url?.trim() || undefined
				})).filter(member => member.bioguideId && !seen.has(member.bioguideId));

				for (const member of pageMembers) {
					seen.add(member.bioguideId);
					members.push(member);
				}

				if (pageMembers.length < limit)
					break;
			}

			return members;
		},
		async getMember(bioguideId: string) {
			const requestUrl = new URL(`https://api.congress.gov/v3/member/${bioguideId.toUpperCase()}`);
			requestUrl.searchParams.set("api_key", resolvedApiKey);
			requestUrl.searchParams.set("format", "json");

			const response = await fetchImpl(requestUrl, {
				headers: {
					Accept: "application/json"
				},
				signal: createFetchTimeoutSignal(resolvedTimeoutMs),
			});

			if (response.status === 404)
				return null;

			if (!response.ok)
				throw new Error(`Congress member lookup failed: ${response.status} ${response.statusText}`);

			const payload = await readProviderResponseJson<CongressMemberDetailResponse>(response);
			const member = payload.member;

			if (!member?.bioguideId || !member?.directOrderName)
				return null;

			return {
				addressInformation: member.addressInformation,
				bioguideId: member.bioguideId.trim(),
				cosponsoredLegislationCount: typeof member.cosponsoredLegislation?.count === "number"
					? member.cosponsoredLegislation.count
					: undefined,
				cosponsoredLegislationUrl: member.cosponsoredLegislation?.url?.trim() || undefined,
				currentMember: member.currentMember !== false,
				depiction: member.depiction?.imageUrl?.trim()
					? {
							attribution: member.depiction.attribution?.trim() || undefined,
							imageUrl: member.depiction.imageUrl.trim(),
						}
					: undefined,
				district: member.district,
				directOrderName: member.directOrderName.trim(),
				firstName: member.firstName?.trim() || undefined,
				lastName: member.lastName?.trim() || undefined,
				officialWebsiteUrl: member.officialWebsiteUrl?.trim() || undefined,
				party: member.partyHistory?.find(item => item.partyName?.trim())?.partyName?.trim() || "Unknown party",
				sponsoredLegislationCount: typeof member.sponsoredLegislation?.count === "number"
					? member.sponsoredLegislation.count
					: undefined,
				sponsoredLegislationUrl: member.sponsoredLegislation?.url?.trim() || undefined,
				state: member.state?.trim() || "",
				terms: (member.terms ?? [])
					.filter(term => typeof term.chamber === "string" && typeof term.congress === "number" && typeof term.startYear === "number")
					.map(term => ({
						chamber: term.chamber as string,
						congress: term.congress as number,
						district: term.district,
						endYear: term.endYear,
						memberType: term.memberType?.trim() || undefined,
						startYear: term.startYear as number,
						stateCode: term.stateCode?.trim() || undefined,
						stateName: term.stateName?.trim() || undefined,
					})),
				updatedAt: member.updateDate?.trim() || undefined,
				url: member.url?.trim() || undefined,
			};
		},
		async listMembersByState(stateCode: string) {
			const requestUrl = new URL(`https://api.congress.gov/v3/member/${stateCode.toUpperCase()}`);
			requestUrl.searchParams.set("api_key", resolvedApiKey);
			requestUrl.searchParams.set("format", "json");
			requestUrl.searchParams.set("limit", "100");

			const response = await fetchImpl(requestUrl, {
				headers: {
					Accept: "application/json"
				},
				signal: createFetchTimeoutSignal(resolvedTimeoutMs),
			});

			if (!response.ok)
				throw new Error(`Congress member lookup failed: ${response.status} ${response.statusText}`);

			const payload = await readProviderResponseJson<CongressMembersResponse>(response);

			return (payload.members ?? []).map(member => ({
				bioguideId: member.bioguideId?.trim() || "unknown-member",
				currentMember: deriveCurrentMemberFromTerms(member.terms?.item),
				district: member.district,
				name: member.name?.trim() || "Unknown member",
				party: member.partyName?.trim() || "Unknown party",
				state: member.state?.trim() || stateCode.toUpperCase(),
				updatedAt: member.updateDate?.trim() || undefined,
				url: member.url?.trim() || undefined
			}));
		}
	};
}
