import React from 'react';
import classnames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { NavigationSlot } from '../../../react-router';
import { TopBarNav } from '../top-bar-nav';
import { TopBarWidgetLink } from '../top-bar-widget-link';
import { useComponent } from '../use-component';
import { FullLoader } from '../../../../to-eject/full-loader';
import { VersionDropdown } from '../../../../components/stage-components/version-dropdown/version-dropdown';
import { MainDropdown } from '../../../../components/stage-components/main-dropdown';
import styles from './menu.module.scss';

export type MenuProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  navigationSlot: NavigationSlot;
  widgetSlot?: NavigationSlot; // currently not used but widget slots will be used in the remote scope for downloads, likes etc. so left it for now
  host: string;
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host }: MenuProps) {
  const component = useComponent(host);
  if (!component) return <FullLoader />;

  const navLinks = navigationSlot.values();
  const widgetLinks = widgetSlot?.values();
  const versionList = component.tags
    ?.toArray()
    .map((tag) => tag?.version?.version)
    .reverse();

  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <nav className={styles.navigation}>
          {navLinks.map((menuItem, key) => (
            <TopBarNav key={key} {...menuItem} />
          ))}
        </nav>
      </div>
      <div className={styles.rightSide}>
        <VersionDropdown versions={versionList} currentVersion={component.version} />
        {/* <span className={styles.widget}>
          <Icon className={classnames(styles.icon)} of="dependency" />
        </span> */}
        {widgetLinks &&
          widgetLinks.map((widget, index) => (
            <TopBarWidgetLink key={index} href={widget.href} className={styles.widget}>
              <Icon className={classnames(styles.icon)} of="changelog" />
            </TopBarWidgetLink>
          ))}
        <MainDropdown />
      </div>
    </div>
  );
}
