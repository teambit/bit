import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { Separator } from '@teambit/documenter-temp.ui.separator';
import { NavLink } from '../../../react-router/nav-link';
import { hoverable } from '../../../../to-eject/css-components/hoverable';
import { clickable } from '../../../../to-eject/css-components/clickable';

import styles from './overview-link.module.scss';

export function OverviewLink() {
  return (
    <div className={styles.overview}>
      <NavLink
        exact
        href="/"
        activeClassName={styles.active}
        className={classNames(hoverable, clickable, styles.overviewLink)}
      >
        Components
        <Icon of="comps" className={styles.icon} />
      </NavLink>
      <Separator className={styles.separator} />
    </div>
  );
}
