import urlParse from 'url-parse';

export type Options = { exact?: boolean; strict?: boolean };

export function compareUrl(baseUrl: string, toMatchUrl: string, { exact, strict }: Options = {}) {
  if (baseUrl === toMatchUrl) return true;

  if (!strict) {
    // remove any trailing slashes, e.g. '.../?query=...', '.../#hash...', '.../'
    baseUrl = baseUrl.replace(/\/(?=[?#]|$)/, '');
    toMatchUrl = toMatchUrl.replace(/\/(?=[?#]|$)/, '');
  }

  const base = urlParse(baseUrl);
  const match = urlParse(toMatchUrl);

  const subUrl = isSubUrl(base, match);
  const exactMatch = !exact || isExactMatch(base, match);
  const strictMatch = !strict || isStrictMatch(base, match);

  return subUrl && exactMatch && strictMatch;
}

function isSubUrl(base: urlParse, match: urlParse) {
  return (
    (!match.protocol || match.protocol === base.protocol) &&
    (!match.hostname || match.hostname === base.hostname) &&
    (!match.port || match.port === base.port) &&
    (!match.pathname || base.pathname.startsWith(match.pathname)) &&
    (!match.query || isSubObject(match.query, base.query)) &&
    (!match.hash || match.hash === base.hash) &&
    (!match.password || match.password === base.password) &&
    (!match.username || match.username === base.username)
  );
}

function isExactMatch(base: urlParse, match: urlParse) {
  return (
    (!match.pathname || base.pathname === match.pathname) && (!match.query || isSubObject(base.query, match.query))
  );
}

function isStrictMatch(base: urlParse, match: urlParse) {
  return !match.pathname || base.pathname.endsWith('/') === match.pathname.endsWith('/');
}

/** returns true when all items in source are also be in target, i.e. source ⊆ target */
function isSubObject(source: Record<string, string | undefined>, target: Record<string, string | undefined>) {
  return Object.keys(source).every((key) => source[key] === target[key]);
}
