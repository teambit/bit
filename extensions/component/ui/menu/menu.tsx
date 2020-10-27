// import { NavigationSlot } from '@teambit/react-router';
// import { MainDropdown } from '@teambit/staged-components.main-dropdown';
import { ImportAction } from '@teambit/documenter.ui.import-action';
import { VersionDropdown } from '@teambit/staged-components.version-dropdown';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import classnames from 'classnames';
import React from 'react';

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
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host }: MenuProps) {
  const { component } = useComponent(host);
  if (!component) return <FullLoader />;

  // const widgetLinks = widgetSlot?.toArray();
  const versionList = component.tags
    ?.toArray()
    .map((tag) => tag?.version?.version)
    .reverse();
  const componentFullName = component?.id?.toString();

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
          <ImportAction copyLink={`bit import ${componentFullName}`} componentName={component.id.name} />
        )}
        <VersionDropdown versions={versionList} currentVersion={component.version} />
        {/* <span className={styles.widget}>
          <Icon className={classnames(styles.icon)} of="dependency" />
        </span> */}
        {/* <MainDropdown /> */}
      </div>
    </div>
  );
}
