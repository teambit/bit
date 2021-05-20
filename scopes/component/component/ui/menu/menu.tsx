import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { ImportAction } from '@teambit/documenter.ui.import-action';
import { VersionDropdown } from '@teambit/component.ui.version-dropdown';
import { FullLoader } from '@teambit/legacy/dist/to-eject/full-loader';
import { Link } from '@teambit/base-ui.routing.link';
import { flatten, groupBy } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';

import type { ComponentModel } from '../component-model';
import { useComponent } from '../use-component';
import { MenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot } from './nav-plugin';

export type MenuProps = {
  className?: string;
  /**
   * slot for top bar menu nav items
   */
  navigationSlot: OrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  widgetSlot: OrderedNavigationSlot;
  host: string;
  /**
   * main dropdown item slot
   */
  menuItemSlot: MenuItemSlot;
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host, menuItemSlot }: MenuProps) {
  const { component } = useComponent(host);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);

  if (!component) return <FullLoader />;

  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <MenuNav navigationSlot={widgetSlot} />
        </div>
        <VersionRelatedDropdowns component={component} />
        <MainDropdown menuItems={mainMenuItems} />
      </div>
    </div>
  );
}

function VersionRelatedDropdowns({ component }: { component: ComponentModel }) {
  const versionList =
    useMemo(
      () =>
        component.tags
          ?.toArray()
          .map((tag) => tag?.version?.version)
          .filter((x) => x !== undefined)
          .reverse(),
      [component.tags]
    ) || [];

  const isLatestVersion = useMemo(() => component.version === versionList[0], [component.version]);
  const packageVersion = useMemo(() => (isLatestVersion ? '' : `@${component.version}`), [component.version]);
  return (
    <>
      {versionList.length > 0 && (
        <ImportAction
          componentName={component.id.name}
          bitLink={component.id.toString({ ignoreVersion: isLatestVersion })}
          Link={(props) => <Link {...props} />}
          packageLink={`${component.packageName}${packageVersion}`}
          registryName={component.packageName.split('/')[0]}
        />
      )}
      <VersionDropdown versions={versionList} currentVersion={component.version} />
    </>
  );
}
