export default function stripTrailingChar(str: string, char: string): string {
  if (!str || !char) {
    return str;
  }
  if (str[str.length - 1] === char) {
    return str.slice(0, -1);
  }
  return str;
}
