import urlParse from 'url-parse';

export type Options = { exact?: boolean; strict?: boolean };

export function compareUrl(
	baseUrl: string,
	toMatchUrl: string,
	{ exact, strict }: Options = {}
) {
	if (baseUrl === toMatchUrl) return true;

	if (!strict) {
		// remove any trailing slashes, e.g. '.../?query=...', '.../#hash...', '.../'
		baseUrl = baseUrl.replace(/\/(?=[?#]|$)/, '');
		toMatchUrl = toMatchUrl.replace(/\/(?=[?#]|$)/, '');
	}

	const base = urlParse(baseUrl);
	const match = urlParse(toMatchUrl);

	const isSubUrl = checkSubUrl(base, match);
	const isExactMatch = !exact || checkExactMatch(base, match);
	const isStrictMatch = !strict || checkStrictMatch(base, match);

	return isSubUrl && isExactMatch && isStrictMatch;
}

function checkSubUrl(base: urlParse, match: urlParse) {
	return (
		(!match.protocol || match.protocol === base.protocol) &&
		(!match.hostname || match.hostname === base.hostname) &&
		(!match.port || match.port === base.port) &&
		(!match.pathname || base.pathname.startsWith(match.pathname)) &&
		(!match.query ||
			Object.keys(match.query).every((key) => match.query[key] === base.query[key])) &&
		(!match.hash || match.hash === base.hash) &&
		(!match.password || match.password === base.password) &&
		(!match.username || match.username === base.username)
	);
}

function checkExactMatch(base: urlParse, match: urlParse) {
	return (
		(!match.pathname || base.pathname === match.pathname) &&
		(!match.query ||
			Object.keys(base.query).every((key) => match.query[key] === base.query[key]))
	);
}

function checkStrictMatch(base: urlParse, match: urlParse) {
	return !match.pathname || base.pathname.endsWith('/') === match.pathname.endsWith('/');
}
