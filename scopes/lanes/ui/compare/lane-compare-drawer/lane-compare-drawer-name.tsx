import React, { HTMLAttributes } from 'react';
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
  onFullScreenClicked?: React.MouseEventHandler<HTMLDivElement>;
  fullScreen?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawerName({
  baseId,
  compareId,
  open,
  onFullScreenClicked,
  fullScreen,
}: LaneCompareDrawerNameProps) {
  const status = !baseId ? 'new' : 'modified';

  return (
    <div className={classnames(styles.drawerNameContainer, open && styles.open)}>
      <div className={styles.left}>
        <div className={classnames(styles.compId, ellipsis)}>{compareId?.toStringWithoutVersion()}</div>
        <div className={styles.status}>
          <CompareStatusResolver status={status} />
        </div>
        <div className={styles.versionContainer}>
          {baseId && (
            <Tooltip content={baseId.version} placement={'bottom'}>
              <div className={styles.version}>{baseId?.version?.substring(0, 6)}</div>
            </Tooltip>
          )}
          {baseId && (
            <div className={styles.versionIcon}>
              <img src="https://static.bit.dev/bit-icons/arrow-right.svg"></img>
            </div>
          )}
          {compareId && (
            <Tooltip content={compareId.version} placement={'bottom'}>
              <div className={styles.version}>{compareId?.version?.substring(0, 6)}</div>
            </Tooltip>
          )}
        </div>
      </div>
      <div className={styles.fullScreen} onClick={onFullScreenClicked}>
        <img
          className={styles.fullScreenIcon}
          src={`https://static.bit.dev/bit-icons/${fullScreen ? 'shrink' : 'enlarge'}.svg`}
        ></img>
      </div>
    </div>
  );
}
