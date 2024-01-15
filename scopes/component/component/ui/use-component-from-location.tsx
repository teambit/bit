import { useParams, useSearchParams } from 'react-router-dom';

/** component url is comprised of letters, numbers, "_", "-", "/" but should not include trailing "/", and should not include "~" */
const componentRegex = /^[\w/-]*[\w-]/;

export function useIdFromLocation(url?: string, deriveScopeFromSearchParams?: boolean): string | undefined {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const scopeFromQueryParams = searchParams.get('scope') ?? undefined;

  const splat = url || params['*'];
  if (!splat) return undefined;

  const [maybeOrgWithScope, ...maybeFullName] = splat.split('/');
  const hasScope = maybeOrgWithScope.split('.').length > 1;
  const fullNameFromUrl = hasScope ? maybeFullName.join('/') : splat;
  let scope: string | undefined;
  if (hasScope) {
    scope = maybeOrgWithScope;
  }
  if (!hasScope && deriveScopeFromSearchParams) {
    scope = scopeFromQueryParams;
  }
  const match = componentRegex.exec(fullNameFromUrl);
  if (!match?.[0]) return undefined;
  if (scope) return `${scope}/${match[0]}`;
  return match[0];
}
