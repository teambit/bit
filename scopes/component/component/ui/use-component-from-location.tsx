import { useParams } from 'react-router-dom';

/** component url is comprised of letters, numbers, "_", "-", "/" but should not include trailing "/", and should not include "~" */
const componentRegex = /^[\w/-]*[\w-]/;

export function useIdFromLocation(): string | undefined {
  const params = useParams();
  const splat = params['*'];
  if (!splat) return undefined;
  const [maybeOrgWithScope, ...maybeFullName] = splat.split('/');
  const hasScope = maybeOrgWithScope.split('.').length > 1;
  const fullNameFromUrl = hasScope ? maybeFullName.join('/') : splat;
  let scope: string | undefined;
  if (hasScope) {
    scope = maybeOrgWithScope;
  }
  const match = componentRegex.exec(fullNameFromUrl);
  if (!match?.[0]) return undefined;
  if (scope) return `${scope}/${match[0]}`;
  return match[0];
}
