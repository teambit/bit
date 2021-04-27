import React from 'react';
import { DrawerUI, DrawerProps } from '@teambit/ui.tree.drawer';
import { Link } from '@teambit/ui.routing.link';
import type { DependencyType } from '@teambit/ui.queries.get-component-code';
import styles from './dependency-drawer.module.scss';

export type DependencyDrawerProps = {
  dependencies?: DependencyType[];
} & DrawerProps;

export function DependencyDrawer({ name, isOpen, onToggle, dependencies }: DependencyDrawerProps) {
  if (!dependencies || dependencies.length === 0) return null;
  return (
    <DrawerUI isOpen={isOpen} onToggle={onToggle} name={name} className={styles.dependencyDrawer}>
      <DependencyList deps={dependencies} />
    </DrawerUI>
  );
}

function DependencyList({ deps }: { deps: DependencyType[] }) {
  if (!deps || deps.length === 0) return null;
  return (
    <>
      {deps.map((dep: DependencyType) => {
        const dependency = getDependencyLink(dep);
        return (
          <div className={styles.depNode} key={dep.id}>
            <Link className={styles.dependencyLink} external href={dependency.link}>
              <span>{`${dependency.name}@${dep.version}`}</span>
            </Link>
          </div>
        );
      })}
    </>
  );
}

// remove this once the links are calculated in the dependency resolver
function getDependencyLink(dep: DependencyType) {
  const version = dep.version.replace('^', '').replace('~', '');
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
