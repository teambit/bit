import React, { useState } from 'react';
import { DrawerUI } from '@teambit/tree.drawer';
import { Link } from '@teambit/ui.routing.link';

import styles from './dependency-tree.module.scss';

type Dependency = {
  id: string;
  lifecycle: string;
  packageName: string | null;
  version: string;
  __typename: string;
};

export type Dependencies = {
  dependencies?: Dependency[];
  devDependencies?: Dependency[];
};

export function DependencyTree({ dependencies }: { dependencies?: Dependencies }) {
  if (!dependencies) return <div />;
  const [isDependenciesOpen, toggleDependencies] = useState(true);
  const [isDevDependenciesOpen, toggleDevDependencies] = useState(true);
  return (
    <div className={styles.dependencyDrawerContainer}>
      <DrawerUI
        isOpen={isDependenciesOpen}
        onToggle={() => toggleDependencies(!isDependenciesOpen)}
        drawer={{ name: 'dependencies', render: () => DependencyList(dependencies?.dependencies) }}
        className={styles.dependencyDrawer}
      />
      <DrawerUI
        isOpen={isDevDependenciesOpen}
        onToggle={() => toggleDevDependencies(!isDevDependenciesOpen)}
        drawer={{ name: 'devDependencies', render: () => DependencyList(dependencies?.devDependencies) }}
        className={styles.dependencyDrawer}
      />
    </div>
  );
}

function DependencyList(deps) {
  if (!deps) return <div />;
  return deps.map((dep) => {
    const linkPrefix = dep.__typename === 'ComponentDependency' ? 'https://bit.dev/' : 'https://npmjs.com/';
    const name = dep.packageName || dep.id;
    const link = dep.id.replace('.', '/').split('@')[0];
    return (
      <div className={styles.depNode} key={dep.id}>
        <Link className={styles.dependencyLink} external href={`${linkPrefix}${link}`}>
          <span>{`${name}@${dep.version}`}</span>
        </Link>
      </div>
    );
  });
}
