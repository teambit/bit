import React, { useState, useMemo } from 'react';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { DependencyDrawer, buildDependencyTree } from '@teambit/code.ui.dependency-tree';

export type CompareDependencyTreeProps = {
  baseDependenciesArray?: DependencyType[];
  compareDependenciesArray?: DependencyType[];
};

export function CompareDependencyTree({ baseDependenciesArray, compareDependenciesArray }: CompareDependencyTreeProps) {
  if (!baseDependenciesArray && !compareDependenciesArray) return null;

  const {
    dependencies: baseDeps,
    devDependencies: baseDevDeps,
    peerDependencies: basePeerDeps,
  } = useMemo(() => {
    if (!baseDependenciesArray || baseDependenciesArray.length === 0) {
      return {
        dependencies: [],
        devDependencies: [],
        peerDependencies: [],
      };
    }
    return buildDependencyTree(baseDependenciesArray);
  }, [baseDependenciesArray]);

  const {
    dependencies: compareDeps,
    devDependencies: compareDevDeps,
    peerDependencies: comparePeerDeps,
  } = useMemo(() => {
    if (!baseDependenciesArray || baseDependenciesArray.length === 0) {
      return {
        dependencies: [],
        devDependencies: [],
        peerDependencies: [],
      };
    }
    return buildDependencyTree(compareDependenciesArray);
  }, [compareDependenciesArray]);

  const [isDependenciesOpen, toggleDependencies] = useState(true);
  const [isDevDependenciesOpen, toggleDevDependencies] = useState(true);
  const [isPeerDependenciesOpen, togglePeerDependencies] = useState(true);

  const baseDepsSet = useMemo(() => new Set<string>(baseDeps.map((dep) => dep.id)), [baseDeps]);
  // const compareDepsSet = useMemo(() => new Set<string>(compareDeps.map((dep) => dep.id)), [compareDeps]);
  const baseDevDepsSet = useMemo(() => new Set<string>(baseDevDeps.map((dep) => dep.id)), [baseDevDeps]);
  // const compareDevDepsSet = useMemo(() => new Set<string>(compareDevDeps.map((dep) => dep.id)), [compareDevDeps]);
  const basePeerDepsSet = useMemo(() => new Set<string>((basePeerDeps || []).map((dep) => dep.id)), [basePeerDeps]);

  // const comparePeerDepsSet = useMemo(
  //   () => new Set<string>((comparePeerDeps || []).map((dep) => dep.id)),
  //   [comparePeerDeps]
  // );

  const dependencies = baseDeps.concat(compareDeps.filter((c) => !baseDepsSet.has(c.id)));
  const devDependencies = baseDevDeps.concat(compareDevDeps.filter((c) => !baseDevDepsSet.has(c.id)));
  const peerDependencies = (basePeerDeps || []).concat(
    (comparePeerDeps || []).filter((c) => !basePeerDepsSet.has(c.id))
  );

  return (
    <>
      <DependencyDrawer
        isOpen={isDependenciesOpen}
        onToggle={() => toggleDependencies(!isDependenciesOpen)}
        name="dependencies"
        dependencies={dependencies}
        // dependencyItemProps={(dep) => {
        //   // if(dep.lifecycle === 'dev')  {

        //   // }

        //   // if(dep.lifecycle === 'peer') {

        //   // }
        // }}
      />

      <DependencyDrawer
        isOpen={isDevDependenciesOpen}
        onToggle={() => toggleDevDependencies(!isDevDependenciesOpen)}
        name="devDependencies"
        dependencies={devDependencies}
      />
      <DependencyDrawer
        isOpen={isPeerDependenciesOpen}
        onToggle={() => togglePeerDependencies(!isPeerDependenciesOpen)}
        name="peerDependencies"
        dependencies={peerDependencies}
      />
    </>
  );
}
