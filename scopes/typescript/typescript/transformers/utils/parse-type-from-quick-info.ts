export function parseTypeFromQuickInfo(displayString?: string) {
  if (!displayString) return '';
  const array = displayString.split(':');
  return array[array.length - 1].trim();
}
