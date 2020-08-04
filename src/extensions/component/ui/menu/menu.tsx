import React from 'react';
import classnames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';

// placeholder until we publish the component from react new project
import { VersionTag } from '../../../stage-components/workspace-components/version-tag';
import styles from './menu.module.scss';
import { NavigationSlot } from '../../../react-router/slot-router';
import { TopBarNav } from '../top-bar-nav';
import { TopBarWidgetLink } from '../top-bar-widget-link';
import { useComponent } from '../use-component';
import { FullLoader } from '../../../../to-eject/full-loader';

export type MenuProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  navigationSlot: NavigationSlot;
  widgetSlot: NavigationSlot;
  host: string;
};

/**
 * top bar menu.
 */
export function Menu({ navigationSlot, widgetSlot, className, host }: MenuProps) {
  const component = useComponent(host);
  if (!component) return <FullLoader />;

  const navLinks = navigationSlot.values();
  const widgetLinks = widgetSlot.values();

  return (
    <div className={classnames(styles.topBar, className)}>
      <nav className={styles.navigation}>
        {navLinks.map((menuItem, key) => (
          <TopBarNav key={key} {...menuItem} />
        ))}
      </nav>
      <div className={styles.rightSide}>
        {/* <span className={styles.widget}>
          <Icon className={classnames(styles.icon)} of="dependency" />
        </span> */}
        {widgetLinks.map((widget, index) => (
          <TopBarWidgetLink key={index} href={widget.href} className={styles.widget}>
            <Icon className={classnames(styles.icon)} of="changelog" />
          </TopBarWidgetLink>
        ))}
        <VersionTag className={classnames(styles.latest, styles.marginRight)}>{component.version}</VersionTag>
        <span>
          <Icon className={classnames(styles.icon)} of="more" />
        </span>
        {/* <span>|</span>
        <Button>import ▾</Button>
        <Button>simulations </Button>
        <Button>code 📄</Button> */}
      </div>
    </div>
  );
}
