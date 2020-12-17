// import { NavigationSlot } from '@teambit/react-router';
import { MainDropdown, MenuItemSlot } from '@teambit/ui.main-dropdown';
import { ImportAction } from '@teambit/documenter.ui.import-action';
import { VersionDropdown } from '@teambit/ui.version-dropdown';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import { flatten, groupBy } from 'lodash';
import classnames from 'classnames';
import React, { useMemo } from 'react';

// import { TopBarWidgetLink } from '../top-bar-widget-link';
import { useComponent } from '../use-component';
import { MenuNav } from './menu-nav';
import styles from './menu.module.scss';
import { OrderedNavigationSlot } from './nav-plugin';

export type MenuProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  navigationSlot: OrderedNavigationSlot;
  widgetSlot: OrderedNavigationSlot;
  host: string;
  menuItemSlot: MenuItemSlot;
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host, menuItemSlot }: MenuProps) {
  const { component } = useComponent(host);
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);

  if (!component) return <FullLoader />;

  const versionList = component.tags
    ?.toArray()
    .map((tag) => tag?.version?.version)
    .reverse();

  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <MenuNav navigationSlot={widgetSlot} />
        </div>
        {versionList.length > 0 && (
          <ImportAction
            componentName={component.id.name}
            bitLink={component.id.toString()}
            packageLink={component.packageName}
            registryName={component.packageName.split('/')[0]}
          />
        )}
        <VersionDropdown versions={versionList} currentVersion={component.version} />
        {/* <span className={styles.widget}>
          <Icon className={classnames(styles.icon)} of="dependency" />
        </span> */}
        <MainDropdown menuItems={mainMenuItems} />
      </div>
    </div>
  );
}
