const scriptUnsafeCharacters = /[<>&\u2028\u2029]/gu;
const scriptSafeEscapes: Record<string, string> = {
	"<": "\\u003C",
	">": "\\u003E",
	"&": "\\u0026",
	"\u2028": "\\u2028",
	"\u2029": "\\u2029"
};

export function serializeJsonLd(value: unknown) {
	return JSON.stringify(value).replace(
		scriptUnsafeCharacters,
		character => scriptSafeEscapes[character] ?? character
	);
}
