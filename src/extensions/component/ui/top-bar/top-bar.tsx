import React from 'react';
import classnames from 'classnames';
// import { Button } from '@bit/bit.evangelist.elements.button';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import { themedText } from '@bit/bit.base-ui.text.themed-text';
import styles from './top-bar.module.scss';
import { NavigationSlot } from '../../../react-router/slot-router';
import { TopBarNav } from '../top-bar-nav';

export type TopBarProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  navigationSlot: NavigationSlot;
  version: string;
};

/**
 * top bar menu.
 */
export function TopBar({ navigationSlot, className, version }: TopBarProps) {
  const navLinks = navigationSlot.values();

  return (
    <div className={classnames(styles.topBar, className)}>
      <nav className={styles.navigation}>
        {navLinks.map((menuItem, key) => (
          <TopBarNav key={key} {...menuItem} />
        ))}
      </nav>
      <div className={styles.rightSide}>
        <span>
          <Icon className={classnames(themedText, styles.icon)} of="version-tag-stroke" /> {version}
        </span>{' '}
        <span>{/* <Icon className={styles.icon} of="download" /> <span>{currentTag.downloads}</span> */}</span>{' '}
        <span>{/* <Icon className={styles.icon} of="heartstroke" /> {currentTag.likes} */}</span>
        {/* <span>|</span>
        <Button>import ▾</Button>
        <Button>simulations </Button>
        <Button>code 📄</Button> */}
      </div>
    </div>
  );
}
