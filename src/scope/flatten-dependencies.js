/** @flow */
import { flatten, values } from '../utils';
import VersionDependencies from './version-dependencies';
import Repository from './objects/repository';
import { BitId } from '../bit-id';

export function flattenDependencies(dependencies: VersionDependencies[]) {
  return values(flatten(dependencies
    .map(dep => dep.dependencies.concat(dep.component)))
    .reduce((components, component) => {
      // in case a component arrives from bit-scope-client, it doesn't have id.
      const bitId = component.id || new BitId({
        scope: component.scope,
        box: component.box,
        name: component.name,
        version: component.version.toString(),
      });
      components[bitId.toString()] = component;
      return components;
    }, {}));
}

export function flattenDependencyIds(dependencies: VersionDependencies[], repo: Repository): Promise<BitId[]> { // eslint-disable-line
  return Promise.all(dependencies.map((dep) => {
    const depCompId = dep.component.id;
    depCompId.scope = dep.sourceScope;
    return dep.component.flattenedDependencies(repo)
      .then(flattnedDeps => flattnedDeps.concat(depCompId));
  }))
    .then((idMatrix) => {
      const ids = flatten(idMatrix);
      return values(ids.reduce((components, id) => {
        components[id.toString()] = id;
        return components;
      }, {}));
    });
}
