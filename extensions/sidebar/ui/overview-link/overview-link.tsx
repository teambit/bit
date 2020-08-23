import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { Separator } from '@teambit/documenter-temp.ui.separator';
import { NavLink } from '@teambit/react-router/nav-link';
import styles from './overview-link.module.scss';

export function OverviewLink() {
  return (
    <div className={styles.overview}>
      <NavLink
        exact
        href="/"
        activeClassName={styles.active}
        className={classNames(
          // hoverable, clickable, // TODO - return these somehow @oded
          styles.overviewLink
        )}
      >
        Components
        <Icon of="comps" className={styles.icon} />
      </NavLink>
      <Separator className={styles.separator} />
    </div>
  );
}
