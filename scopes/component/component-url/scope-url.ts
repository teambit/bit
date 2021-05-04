import { baseUrl } from './constants';

/** converts a scope id to a url */
export const ScopeUrl = {
  toUrl,
  toPathname,
};

function toUrl(scope: string) {
  return `${baseUrl}/${toPathname(scope)}`;
}

function toPathname(scope: string) {
  return scope.replace('.', '/');
}
