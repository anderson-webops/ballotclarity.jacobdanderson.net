import assert from "node:assert/strict";
import test from "node:test";
import { createLocationGuessService } from "../src/location-guess.js";

function createRequest(headers: Record<string, string>) {
	return {
		header(name: string) {
			return headers[name.toLowerCase()];
		}
	} as never;
}

test("proxy location guessing accepts bounded U.S. geography headers", () => {
	const service = createLocationGuessService({
		mode: "proxy_headers",
		proxyHeaders: {
			cityHeaders: ["x-geo-city"],
			countryHeaders: ["x-geo-country"],
			postalCodeHeaders: ["x-geo-postal-code"],
			regionHeaders: ["x-geo-region"]
		}
	});

	assert.deepEqual(service.buildGuess(createRequest({
		"x-geo-city": " Provo ",
		"x-geo-country": "us",
		"x-geo-postal-code": "84604",
		"x-geo-region": "UT"
	})), {
		city: "Provo",
		country: "US",
		postalCode: "84604",
		rawQuery: "84604",
		region: "UT"
	});
});

test("proxy location guessing ignores malformed, foreign, and oversized geography", () => {
	const service = createLocationGuessService({
		mode: "proxy_headers",
		proxyHeaders: {
			cityHeaders: ["x-geo-city"],
			countryHeaders: ["x-geo-country"],
			postalCodeHeaders: ["x-geo-postal-code"],
			regionHeaders: ["x-geo-region"]
		}
	});

	assert.equal(service.buildGuess(createRequest({
		"x-geo-country": "CA",
		"x-geo-postal-code": "M5V 3L9"
	})), null);
	assert.equal(service.buildGuess(createRequest({
		"x-geo-country": "US",
		"x-geo-postal-code": "not-a-zip"
	})), null);
	assert.equal(service.buildGuess(createRequest({
		"x-geo-city": "x".repeat(121),
		"x-geo-country": "US",
		"x-geo-region": "GA"
	})), null);
});

test("proxy location guessing discards invalid configured header names", () => {
	const service = createLocationGuessService({
		mode: "proxy_headers",
		proxyHeaders: {
			postalCodeHeaders: ["x-geo-postal-code", "bad header"]
		}
	});

	assert.deepEqual(service.varyHeaders, ["x-geo-postal-code"]);
});

test("proxy location guessing fails closed when trusted-header provenance is not asserted", () => {
	const service = createLocationGuessService({
		mode: "proxy_headers",
		proxyHeaders: {
			postalCodeHeaders: ["x-geo-postal-code"],
		},
		trustProxyHeaders: false,
	});

	assert.equal(service.publicConfig.canGuessOnLoad, false);
	assert.deepEqual(service.varyHeaders, []);
	assert.equal(service.buildGuess(createRequest({
		"x-geo-postal-code": "30303",
	})), null);
});
