/**
 * Array.filter is synchronous and therefore does not support Promises.
 * This one works with promises.
 * Taken from https://stackoverflow.com/questions/33355528/filtering-an-array-with-a-function-that-returns-a-promise
 */
export default function filterAsync(array: any[], filter): Promise<any[]> {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return Promise.all(array.map((entry) => filter(entry))).then((results) => array.filter(() => results.shift()));
}
