import React from 'react';
import classnames from 'classnames';
import { Button } from '@bit/bit.evangelist.elements.button';
import { Icon } from '@bit/bit.evangelist.elements.icon';
import { themedText } from '@bit/bit.base-ui.text.themed-text';
import { SectionSlotRegistry } from '../../component.ui';
import styles from './top-bar.module.scss';

export type TopBarProps = {
  className?: string;
  /**
   * slot for top bar menu items
   */
  sectionSlot: SectionSlotRegistry;
  currentTag: {
    version: string;
    downloads: number;
    likes: number;
  };
};

/**
 * top bar menu.
 */
export function TopBar({ sectionSlot, className, currentTag }: TopBarProps) {
  const menuItems = sectionSlot.values();

  return (
    <div className={classnames(styles.topBar, className)}>
      <ul className={styles.navigation}>
        {menuItems.map((menuItem, key) => (
          <li key={key} onClick={menuItem.onClick}>
            {menuItem.label}
          </li>
        ))}
      </ul>
      <div className={styles.rightSide}>
        <span>
          <Icon className={classnames(themedText, styles.icon)} of="version-tag-stroke" /> {currentTag.version}
        </span>{' '}
        <span>
          <Icon className={styles.icon} of="download" /> <span>{currentTag.downloads}</span>
        </span>{' '}
        <span>
          <Icon className={styles.icon} of="heartstroke" /> {currentTag.likes}
        </span>{' '}
        <span>|</span>
        <Button importance="muted">import ▾</Button>
        <Button importance="muted">simulations </Button>
        <Button importance="muted">code 📄</Button>
      </div>
    </div>
  );
}
