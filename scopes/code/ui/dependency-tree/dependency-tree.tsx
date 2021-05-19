import React, { useState, useMemo } from 'react';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
import { buildDependencyTree } from './build-depndency-tree';
import { DependencyDrawer } from './dependency-drawer/dependency-drawer'; // TODO - find out why this explodes when I direct to index.ts

export function DependencyTree({ dependenciesArray }: { dependenciesArray?: DependencyType[] }) {
  if (!dependenciesArray) return null;
  const { dependencies, devDependencies, peerDependencies } = useMemo(() => buildDependencyTree(dependenciesArray), [
    dependenciesArray,
  ]);

  const [isDependenciesOpen, toggleDependencies] = useState(true);
  const [isDevDependenciesOpen, toggleDevDependencies] = useState(true);
  const [isPeerDependenciesOpen, togglePeerDependencies] = useState(true);
  return (
    <>
      <DependencyDrawer
        isOpen={isDependenciesOpen}
        onToggle={() => toggleDependencies(!isDependenciesOpen)}
        name="dependencies"
        dependencies={dependencies}
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
