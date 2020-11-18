import humanizeString from 'humanize-string';

export function humanizeCompositionId(rawId: string) {
  return humanizeString(rawId);
}
