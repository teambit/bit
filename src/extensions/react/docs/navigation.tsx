export function getCurrentComponentId() {
  if (typeof window === 'undefined') return undefined;

  const { hash } = window.location;
  if (!hash) return undefined;

  let queryIdx: number | undefined = hash.indexOf('?');
  if (queryIdx === -1) queryIdx = undefined;

  return hash.slice(1, queryIdx); // remove hash character
}
