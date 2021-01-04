import React, { useState, useMemo } from 'react';
import { DrawerUI } from '@teambit/tree.drawer';
import { Link } from '@teambit/ui.routing.link';
import type { DependencyType } from '@teambit/ui.queries.get-component-code';
import { buildDependencyTree } from './build-depndency-tree';
import styles from './dependency-tree.module.scss';

export function DependencyTree({ dependenciesArray }: { dependenciesArray?: DependencyType[] }) {
  if (!dependenciesArray) return null;
  const { dependencies, devDependencies } = useMemo(() => buildDependencyTree(dependenciesArray), [dependenciesArray]);

  const [isDependenciesOpen, toggleDependencies] = useState(true);
  const [isDevDependenciesOpen, toggleDevDependencies] = useState(true);
  return (
    <div className={styles.dependencyDrawerContainer}>
      <DrawerUI
        isOpen={isDependenciesOpen}
        onToggle={() => toggleDependencies(!isDependenciesOpen)}
        drawer={{ name: 'dependencies', render: () => DependencyList(dependencies) }}
        className={styles.dependencyDrawer}
      />
      <DrawerUI
        isOpen={isDevDependenciesOpen}
        onToggle={() => toggleDevDependencies(!isDevDependenciesOpen)}
        drawer={{ name: 'devDependencies', render: () => DependencyList(devDependencies) }}
        className={styles.dependencyDrawer}
      />
    </div>
  );
}

// TODO - add type. currently causes issues
function DependencyList(deps) {
  if (!deps) return null;
  return deps.map((dep: DependencyType) => {
    const dependency = getDependencyLink(dep);
    return (
      <div className={styles.depNode} key={dep.id}>
        <Link className={styles.dependencyLink} external href={dependency.link}>
          <span>{`${dependency.name}@${dep.version}`}</span>
        </Link>
      </div>
    );
  });
}

// remove this once the links are calculated in the dependency resolver
function getDependencyLink(dep: DependencyType) {
  const version = dep.version.replace('^', '');
  const linkPrefix = dep.__typename === 'ComponentDependency' ? 'https://bit.dev/' : 'https://npmjs.com/package/';
  if (dep.packageName) {
    return {
      name: dep.packageName,
      link: `${linkPrefix}${dep.id.replace('.', '/').split('@')[0]}?version=${version}`,
    };
  }
  return {
    name: dep.id,
    link: `${linkPrefix}${dep.id}/v/${version}`,
  };
}
