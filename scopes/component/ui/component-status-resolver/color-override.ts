export function getOverrideColor(issuesCount: number, isModified?: boolean) {
  if (issuesCount > 0) {
    return 'error';
  }
  if (isModified) {
    return 'modified';
  }
  return '';
}
