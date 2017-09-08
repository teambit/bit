/** @flow */
import { flatten, values } from '../utils';
import VersionDependencies from './version-dependencies';
import Repository from './objects/repository';
import { BitId } from '../bit-id';

export function flattenDependencies(dependencies: VersionDependencies[]) {
  return values(
    flatten(dependencies.map(dep => dep.dependencies.concat(dep.component))).reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {})
  );
}

export function flattenDependencyIds(dependencies: VersionDependencies[], repo: Repository): Promise<BitId[]> {
  // eslint-disable-line
  return Promise.all(
    dependencies.map((dep) => {
      const depCompId = dep.component.id;
      depCompId.scope = dep.sourceScope;
      return dep.component.flattenedDependencies(repo).then(flattnedDeps => flattnedDeps.concat(depCompId));
    })
  ).then((idMatrix) => {
    const ids = flatten(idMatrix);
    return values(
      ids.reduce((components, id) => {
        components[id.toString()] = id;
        return components;
      }, {})
    );
  });
}
