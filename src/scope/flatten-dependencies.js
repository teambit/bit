/** @flow */
import { flatten, values } from '../utils';
import ComponentDependencies from '../scope/component-dependencies';
import Bit from '../consumer/bit-component';

export default function flattenDependencies(componentDependencies: ComponentDependencies[]): Bit[] {
  return values(flatten(componentDependencies
    .map(dep => dep.dependencies.concat(dep.component)))
    .reduce((bits, bit) => {
      bits[bit.id.toString()] = bit;
      return bits;
    }, {}));
}
