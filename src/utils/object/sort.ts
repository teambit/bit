/**
 * Sort an object.
 */
export default function sortObject(obj: Record<string, any>) {
  return Object.keys(obj)
    .sort()
    .reduce(function (result, key) {
      result[key] = obj[key];
      return result;
    }, {});
}
