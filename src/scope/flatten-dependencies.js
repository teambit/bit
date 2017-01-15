/** @flow */
import { flatten, values } from '../utils';
import VersionDependencies from './version-dependencies';

export default function flattenDependencies(dependencies: VersionDependencies[]) {
  return values(flatten(dependencies
    .map(dep => dep.dependencies.concat(dep.component)))
    .reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {}));
}
