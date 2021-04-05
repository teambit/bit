import { flatten } from '../utils';
import ComponentWithDependencies from './component-dependencies';

export function flattenDependencies(dependencies: ComponentWithDependencies[]) {
  return Object.values(
    flatten(dependencies.map((dep) => dep.allDependencies.concat(dep.component))).reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {})
  );
}
