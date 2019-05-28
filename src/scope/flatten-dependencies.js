/** @flow */
import { flatten, values } from '../utils';
import VersionDependencies from './version-dependencies';
import Repository from './objects/repository';
import { BitId } from '../bit-id';
import ComponentWithDependencies from './component-dependencies';

export function flattenDependencies(dependencies: ComponentWithDependencies[]) {
  return values(
    flatten(dependencies.map(dep => dep.allDependencies.concat(dep.component))).reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {})
  );
}

export function flattenDependencyIds(dependencies: VersionDependencies[], repo: Repository): Promise<BitId[]> {
  return Promise.all(
    dependencies.map((dep) => {
      // $FlowFixMe
      const depCompId = dep.component.id.changeScope(dep.sourceScope);
      return dep.component.flattenedDependencies(repo).then(flattenedDeps => flattenedDeps.concat(depCompId));
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
