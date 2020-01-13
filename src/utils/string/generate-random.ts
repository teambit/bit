/**
 * Generates random string of specific size
 * @param size
 */
export default function generateRandomStr(size = 8): string {
  return Math.random()
    .toString(36)
    .slice(size * -1)
    .replace('.', ''); // it's rare but possible that the first char is '.', which is invalid for a scope-name
}
