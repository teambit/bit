/**
 * It sorts the array, and then looks just at the first and last items
 * taken from https://stackoverflow.com/questions/1916218/find-the-longest-common-starting-substring-in-a-set-of-strings
 * @param {[]} array
 */
export default function sharedStartOfArray(array: string[]) {
  const sortedArray = array.concat().sort();
  const firstItem = sortedArray[0];
  const lastItem = sortedArray[sortedArray.length - 1];
  let i = 0;
  while (i < firstItem.length && firstItem.charAt(i) === lastItem.charAt(i)) i += 1;
  return firstItem.substring(0, i);
}
