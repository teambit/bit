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
  compareIdOverride?: ComponentID;
  baseIdOverride?: string;
  open?: boolean;
  leftWidget?: React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const shortenVersion = (version?: string) => (semver.valid(version) ? version : version?.substring(0, 6));

export function LaneCompareDrawerName({
  baseId,
  compareId,
  open,
  leftWidget,
  compareIdOverride,
}: LaneCompareDrawerNameProps) {
  const status = !baseId ? 'new' : (!compareId?.isEqual(baseId) && 'modified') || undefined;
  const key = `drawer-name-${baseId}-${compareId}`;
  const isCompareOverriden = compareIdOverride && compareIdOverride.version !== compareId?.version;

  return (
    <div key={key} className={classnames(styles.drawerNameContainer, open && styles.open)}>
      <div className={styles.left}>
        <React.Fragment key={`${key}-${baseId}-${compareId}-left-widget`}>{leftWidget}</React.Fragment>
        <div className={styles.status}>{status && <CompareStatusResolver status={status} />}</div>
        <div className={classnames(styles.compId, ellipsis)}>{compareId?.toStringWithoutVersion()}</div>
        <div className={styles.versionContainer}>
          {baseId && (
            <Tooltip content={baseId.version} placement={'bottom'}>
              <div className={styles.version}>{shortenVersion(baseId?.version)}</div>
            </Tooltip>
          )}
          {baseId && (
            <div className={styles.versionIcon}>
              <img src="https://static.bit.dev/bit-icons/arrow-right.svg"></img>
            </div>
          )}
          {compareId && (
            <Tooltip content={compareId.version} placement={'bottom'}>
              <div className={classnames(styles.version, isCompareOverriden && styles.override)}>
                {shortenVersion(compareId?.version)}
              </div>
            </Tooltip>
          )}
          {compareIdOverride && (
            <Tooltip content={compareIdOverride.version} placement={'bottom'}>
              <div className={classnames(styles.version, styles.overridden)}>
                {shortenVersion(compareIdOverride?.version)}
              </div>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
