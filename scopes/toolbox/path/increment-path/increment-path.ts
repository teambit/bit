/**
 * appends "_1" to the path, or a higher number if that one is taken, e.g. "bar" => "bar_1".
 */
export function incrementPathRecursively(p: string, allPaths: string[]) {
  const incrementPath = (str: string, number: number) => `${str}_${number}`;
  let num = 1;
  let newPath = incrementPath(p, num);
  while (allPaths.includes(newPath)) {
    newPath = incrementPath(p, (num += 1));
  }
  return newPath;
}
