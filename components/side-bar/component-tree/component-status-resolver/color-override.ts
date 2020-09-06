export function getOverrideColor(issuesCount, isModified) {
  if (issuesCount > 0) {
    return 'error';
  }
  if (isModified) {
    return 'modified';
  }
  return '';
}
