export function parseTypeFromQuickInfo(displayString?: string) {
  if (!displayString) return '';
  const array = displayString.split(':');
  return array[array.length - 1].trim();
}

export function parseReturnTypeFromQuickInfo(displayString?: string) {
  if (!displayString) return '';
  const typeStr = parseTypeFromQuickInfo(displayString);
  const array = typeStr.split('=>');
  return array[array.length - 1].trim();
}
