import React from 'react';
import classNames from 'classnames';

import { FullLoader } from '@teambit/ui-foundation.ui.full-loader';
import type { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { mutedItalic } from '@teambit/design.ui.styles.muted-italic';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { indentClass } from '@teambit/base-ui.graph.tree.indent';
import { getLanesQuery } from '../hooks/lanes-query/lanes.query';
import styles from './lanes-drawer.module.scss';

export class LanesDrawer implements DrawerType {
  name = 'LANES';

  render = () => {
    const { lanes } = getLanesQuery();

    if (!lanes) return <FullLoader />;
    if (lanes.length === 0)
      return <span className={classNames(mutedItalic, ellipsis, styles.emptyScope)}>Scope is empty</span>;
    return (
      <div>
        {lanes.map((lane) => (
          <NavLink key={lane.name} href={`~lane/${lane.name}`} activeClassName={styles.active}>
            <p>{lane.name}</p>
          </NavLink>
        ))}
      </div>
    );
  };
}
