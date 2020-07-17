export default function hasWildcard(ids: string | null | undefined | string[]): boolean {
  if (!ids) return false;
  if (Array.isArray(ids)) {
    return ids.some((id) => idHasWildcard(id));
  }
  return idHasWildcard(ids);
}

function idHasWildcard(id: string) {
  if (!id) return false;
  if (typeof id !== 'string') {
    throw new Error(`idHasWildcard expects id to be string, got ${typeof id}`);
  }
  return id.includes('*');
}
