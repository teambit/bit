import React, { HTMLAttributes } from 'react';
import { ComponentID } from '@teambit/component-id';
import { CompareStatusResolver } from '@teambit/component.ui.component-compare.status-resolver';
import { Tooltip } from '@teambit/design.ui.tooltip';

import styles from './lane-compare-drawer-name.module.scss';

export type LaneCompareDrawerNameProps = {
  baseId?: ComponentID;
  compareId?: ComponentID;
  open?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawerName({ baseId, compareId }: LaneCompareDrawerNameProps) {
  const status = !baseId ? 'new' : 'modified';

  return (
    <div className={styles.drawerNameContainer}>
      <div className={styles.compId}>{compareId?.toStringWithoutVersion()}</div>
      <div className={styles.status}>
        <CompareStatusResolver status={status} />
      </div>
      <div className={styles.versionContainer}>
        {baseId && (
          <Tooltip content={baseId.version} placement={'bottom'}>
            <div className={styles.version}>{baseId?.version}</div>
          </Tooltip>
        )}
        {baseId && (
          <div className={styles.versionIcon}>
            <img src="https://static.bit.dev/bit-icons/arrow-right.svg"></img>
          </div>
        )}
        {compareId && (
          <Tooltip content={compareId.version} placement={'bottom'}>
            <div className={styles.version}>{compareId.version}</div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
