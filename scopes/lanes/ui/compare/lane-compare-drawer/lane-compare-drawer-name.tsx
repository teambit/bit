import React, { HTMLAttributes } from 'react';
import * as semver from 'semver';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { ComponentID } from '@teambit/component-id';
import { CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';
import { Tooltip } from '@teambit/design.ui.tooltip';
import classnames from 'classnames';

import styles from './lane-compare-drawer-name.module.scss';

export type LaneCompareDrawerNameProps = {
  baseId?: ComponentID;
  compareId?: ComponentID;
  open?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawerName({ baseId, compareId, open }: LaneCompareDrawerNameProps) {
  const status = !baseId ? 'new' : 'modified';
  const shortenVersion = (version?: string) => (semver.valid(version) ? version : version?.substring(0, 6));

  return (
    <div className={classnames(styles.drawerNameContainer, open && styles.open)}>
      <div className={styles.left}>
        <div className={classnames(styles.compId, ellipsis)}>{compareId?.toStringWithoutVersion()}</div>
        <div className={styles.status}>
          <CompareStatusResolver status={status} />
        </div>
        <div className={styles.versionContainer}>
          {compareId && (
            <Tooltip content={compareId.version} placement={'bottom'}>
              <div className={styles.version}>{shortenVersion(compareId?.version)}</div>
            </Tooltip>
          )}
          {compareId && (
            <div className={styles.versionIcon}>
              <img src="https://static.bit.dev/bit-icons/arrow-right.svg"></img>
            </div>
          )}
          {baseId && (
            <Tooltip content={baseId.version} placement={'bottom'}>
              <div className={styles.version}>{shortenVersion(baseId?.version)}</div>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
