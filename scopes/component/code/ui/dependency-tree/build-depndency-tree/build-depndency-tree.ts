import type { DependencyType } from '@teambit/ui.queries.get-component-code';

export function buildDependencyTree(deps?: DependencyType[]) {
  const devDependencies: DependencyType[] = [];
  const dependencies: DependencyType[] = [];
  if (!deps)
    return {
      dependencies,
      devDependencies,
    };
  deps.map((dep) => {
    if (dep.lifecycle === 'dev') {
      devDependencies.push(dep);
      return;
    }
    dependencies.push(dep);
    return;
  });
  return {
    dependencies,
    devDependencies,
  };
}
