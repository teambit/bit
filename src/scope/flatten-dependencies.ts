import ComponentWithDependencies from './component-dependencies';

export function flattenDependencies(dependencies: ComponentWithDependencies[]) {
  return Object.values(
    dependencies
      .map((dep) => dep.allDependencies.concat(dep.component))
      .flat()
      .reduce((components, component) => {
        components[component.id.toString()] = component;
        return components;
      }, {})
  );
}
