import { baseUrl } from './constants';

function toPathname(scope: string) {
  return scope.replace('.', '/');
}

function toUrl(scope: string) {
  return `${baseUrl}/${toPathname(scope)}`;
}

/** converts a scope id to a url */
export const ScopeUrl = {
  toUrl,
  toPathname,
};
