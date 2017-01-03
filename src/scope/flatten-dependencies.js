/** @flow */
import { flatten, values } from '../utils';

export default function flattenDependencies(bitDependencies: BitDependencies[]) {
  return values(flatten(bitDependencies
    .map(dep => dep.dependencies.concat(dep.bit)))
    .reduce((bits, bit) => {
      bits[bit.getId().toString()] = bit;
      return bits;
    }, {}));
}
