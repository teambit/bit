import { useParams } from 'react-router-dom';

/** component url is comprised of letters, numbers, "_", "-", "/" but should not include trailing "/", and should not include "~" */
const componentRegex = /^[\w/-]*[\w-]/;
export function useIdFromLocation() {
  const params = useParams();
  const splat = params['*'];
  if (!splat) return undefined;

  const match = componentRegex.exec(splat);
  return match?.[0];
}
