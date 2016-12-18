/** @array */
export default function first(array: any[]): ?any {
  if (array && array[0]) return array[0];
  return null;
}
