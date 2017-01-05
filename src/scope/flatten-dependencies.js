/** @flow */
import { flatten, values } from '../utils';
import { BitDependencies } from '../scope';
import Bit from '../bit';

export default function flattenDependencies(bitDependencies: BitDependencies[]): Bit[] {
  return values(flatten(bitDependencies
    .map(dep => dep.dependencies.concat(dep.bit)))
    .reduce((bits, bit) => {
      bits[bit.getId().toString()] = bit;
      return bits;
    }, {}));
}
