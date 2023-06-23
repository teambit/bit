export function getOffsetValue(offset, limit, backwards = false) {
  if (offset !== undefined) {
    return backwards ? -(offset + limit) : offset;
  }
  if (limit !== undefined) {
    return 0;
  }
  return undefined;
}
