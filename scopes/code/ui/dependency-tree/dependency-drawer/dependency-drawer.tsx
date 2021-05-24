import React from 'react';
import { DrawerUI, DrawerProps } from '@teambit/ui-foundation.ui.tree.drawer';
import { Link } from '@teambit/base-ui.routing.link';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { ComponentID } from '@teambit/component-id';
import type { DependencyType } from '@teambit/code.ui.queries.get-component-code';
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
  // TODO - this doesn't work for range semver, like `^16.0.0 || ^17.0.0`
  const version = dep.version.replace('^', '').replace('~', '');

  // maybe can deduce isBitComponent iff dep.packageName is defined?
  // or if dep.packageName !== dep.id
  const isBitComponent = dep.__typename === 'ComponentDependency';
  const compId = ComponentID.tryFromString(dep.id);

  if (dep.packageName && isBitComponent && compId) {
    return {
      name: dep.packageName,
      link: ComponentUrl.toUrl(compId),
    };
  }

  const npmPrefix = 'https://npmjs.com/package';
  return {
    name: dep.packageName || dep.id,
    link: `${npmPrefix}/${dep.packageName || dep.id}/v/${version}`,
  };
}
