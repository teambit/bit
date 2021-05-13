import { Separator } from '@teambit/documenter.ui.separator';
import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { clickable } from '@teambit/legacy/dist/to-eject/css-components/clickable';
import { hoverable } from '@teambit/legacy/dist/to-eject/css-components/hoverable';
import classNames from 'classnames';
import React from 'react';

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
