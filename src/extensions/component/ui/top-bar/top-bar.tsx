import React from 'react';
import classnames from 'classnames';
import { NavLink, NavLinkProps, useRouteMatch } from 'react-router-dom';
// import { Button } from '@bit/bit.evangelist.elements.button';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import { themedText } from '@bit/bit.base-ui.text.themed-text';
// placeholder until we publish the component from react new project
import { VersionTag } from '../../../stage-components/workspace-components/version-tag';
import styles from './top-bar.module.scss';
import { NavigationSlot } from '../../../react-router/slot-router';
import { TopBarNav } from '../top-bar-nav';
import { TopBarWidgetLink } from '../top-bar-widget-link';

export type TopBarProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  navigationSlot: NavigationSlot;
  widgetSlot: NavigationSlot;

  currentTag: {
    version: string;
    downloads: number;
    likes: number;
  };
};

/**
 * top bar menu.
 */
export function TopBar({ navigationSlot, widgetSlot, className, currentTag }: TopBarProps) {
  const navLinks = navigationSlot.values();

  return (
    <div className={classnames(styles.topBar, className)}>
      <nav className={styles.navigation}>
        {navLinks.map((menuItem, key) => (
          <TopBarNav key={key} {...menuItem} />
        ))}
      </nav>
      <div className={styles.rightSide}>
        <TopBarWidgetLink to={widgetSlot.values()[0].to}>
          <Icon className={classnames(styles.icon)} of="floppy" />
        </TopBarWidgetLink>{' '}
        <span>{currentTag.version}</span> <VersionTag className={styles.marginRight}>Latest</VersionTag>
        {/* <span>|</span>
        <Button>import ▾</Button>
        <Button>simulations </Button>
        <Button>code 📄</Button> */}
      </div>
    </div>
  );
}
