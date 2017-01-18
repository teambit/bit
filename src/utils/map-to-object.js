/** @flow */

export default function mapToObject(map: Map<any, any>): {[string|number]: any} {
  const object = {};
  map.forEach((val, key) => {
    object[key] = val;
  });
  return object;
}
