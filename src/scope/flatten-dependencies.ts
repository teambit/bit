import { BitIds } from '../bit-id';
import { flatten } from '../utils';
import ComponentWithDependencies from './component-dependencies';
import Repository from './objects/repository';
import VersionDependencies from './version-dependencies';

export function flattenDependencies(dependencies: ComponentWithDependencies[]) {
  return Object.values(
    flatten(dependencies.map((dep) => dep.allDependencies.concat(dep.component))).reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {})
  );
}

export async function flattenDependencyIds(dependencies: VersionDependencies[], repo: Repository): Promise<BitIds> {
  const ids = await Promise.all(
    dependencies.map((dep) => {
      const depCompId = dep.component.id.changeScope(dep.sourceScope);
      return dep.component.flattenedDependencies(repo).then((flattenedDeps) => flattenedDeps.concat(depCompId));
    })
  );
  const flattenedIds = flatten(ids);
  return BitIds.uniqFromArray(flattenedIds);
}
