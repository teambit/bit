export function getOverrideColor({
  issuesCount,
  isModified,
  isNew,
}: {
  issuesCount: number;
  isModified?: boolean;
  isNew?: boolean;
}) {
  if (issuesCount > 0) {
    return 'error';
  }
  if (isModified && !isNew) {
    return 'modified';
  }
  return '';
}
