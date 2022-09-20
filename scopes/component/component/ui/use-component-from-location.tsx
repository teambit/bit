import { useParams } from 'react-router-dom';

/** component url is comprised of letters, numbers, "_", "-", "/" but should not include trailing "/", and should not include "~" */
const componentRegex = /^[\w/-]*[\w-]/;

export function useIdFromLocation(): string | undefined {
  const params = useParams();
  const splat = params['*'];
  if (!splat) return undefined;
  const [maybeOrg, maybeScopeAndFullName] = splat.split('.');
  let fullNameFromUrl = splat;
  let scope: string | undefined;
  if (maybeScopeAndFullName) {
    const [scopeFromUrl, fullName] = maybeScopeAndFullName.split('/');
    fullNameFromUrl = fullName;
    scope = `${maybeOrg}.${scopeFromUrl}`;
  }

  const match = componentRegex.exec(fullNameFromUrl);
  if (!match?.[0]) return undefined;
  if (scope) return `${scope}/${match[0]}`;
  return match[0];
}
