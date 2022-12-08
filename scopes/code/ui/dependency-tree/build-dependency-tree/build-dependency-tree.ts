import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';

export function buildDependencyTree(deps?: DependencyType[]) {
  const devDependencies: DependencyType[] = [];
  const dependencies: DependencyType[] = [];
  const peerDependencies: DependencyType[] = [];
  if (!deps)
    return {
      dependencies,
      devDependencies,
    };

  deps.map((dep) => {
    if (dep.lifecycle === 'dev') {
      devDependencies.push(dep);
      return undefined;
    }
    if (dep.lifecycle === 'peer') {
      peerDependencies.push(dep);
      return undefined;
    }
    dependencies.push(dep);
    return undefined;
  });

  return {
    dependencies,
    devDependencies,
    peerDependencies,
  };
}
