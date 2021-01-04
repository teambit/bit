import type { DependencyType } from '@teambit/ui.queries.get-component-code';

export function buildDependencyTree(deps?: DependencyType[]) {
  const devDependencies: DependencyType[] = [];
  const dependencies: DependencyType[] = [];
  console.log('deps', deps);
  if (!deps)
    return {
      dependencies: dependencies,
      devDependencies: devDependencies,
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
    dependencies: dependencies,
    devDependencies: devDependencies,
  };
}
