/** @flow */
import { flatten, values } from '../utils';
import type { ComponentTree } from './repositories/sources';

export default function flattenDependencies(dependencies: ComponentTree[]) {
  return values(flatten(dependencies
    .map(dep => dep.dependencies.concat(dep.component)))
    .reduce((components, component) => {
      components[component.hash()] = component;
      return components;
    }, {}));
}
