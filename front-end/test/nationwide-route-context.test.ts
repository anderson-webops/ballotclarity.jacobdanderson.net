import assert from "node:assert/strict";
import test from "node:test";
import {
	buildNationwideLookupRouteQuery,
	buildNationwideRouteTarget,
	extractNationwideLookupRouteQuery,
} from "../src/utils/nationwide-route-context.ts";

test("nationwide route context carries only an exact five-digit ZIP", () => {
	assert.deepEqual(
		buildNationwideLookupRouteQuery({
			lookupQuery: "30303",
			selectionId: "zip:30303:atlanta-georgia",
		}),
		{
			lookup: "30303",
			selection: "zip:30303:atlanta-georgia",
		}
	);
	assert.equal(
		buildNationwideLookupRouteQuery({
			lookupQuery: "55 Trinity Ave SW, Atlanta, GA 30303",
		}),
		undefined
	);
	assert.equal(
		buildNationwideRouteTarget("/results", {
			lookupQuery: "55 Trinity Ave SW, Atlanta, GA 30303",
		}),
		"/results"
	);
});

test("route parsing rejects address and malformed selection values", () => {
	assert.equal(
		extractNationwideLookupRouteQuery({
			lookup: "55 Trinity Ave SW, Atlanta, GA 30303",
		}),
		null
	);
	assert.deepEqual(
		extractNationwideLookupRouteQuery({
			lookup: "30303",
			selection: "contains spaces",
		}),
		{ lookup: "30303" }
	);
});
