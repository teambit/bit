import { ComponentStatus as StatusProps } from '@teambit/workspace';
import React from 'react';
import classNames from 'classnames';
import { ComponentStatus } from '@teambit/component.ui.component-status';
import { StatusTooltip } from '@teambit/component.ui.component-tooltip';
import { LanesIcon } from '@teambit/lanes.ui.icon';
import { getOverrideColor } from './color-override';

import styles from './component-status-resolver.module.scss';

export type ComponentStatusResolverProps = {
  status?: StatusProps;
  issuesCount?: number;
  isInCurrentLane?: boolean;
};

export function ComponentStatusResolver({ status, issuesCount = 0, isInCurrentLane }: ComponentStatusResolverProps) {
  if (!status) return null;
  const isModified = status.modifyInfo.hasModifiedFiles;
  const colorOverride = getOverrideColor({ issuesCount, isModified, isNew: status.isNew });
  return (
    <StatusTooltip status={status} issuesCount={issuesCount} isInCurrentLane={isInCurrentLane}>
      <div className={styles.statusLine}>
        {issuesCount > 0 && (
          <div className={classNames(styles.errorBlock, styles.error)}>
            <span>{issuesCount}</span>
          </div>
        )}
        {status.isNew && !status.isOutdated && <ComponentStatus className={styles[colorOverride]} status="new" />}
        {isModified && !status.isNew && <ComponentStatus className={styles[colorOverride]} status="modified" />}
        {status.isStaged && <ComponentStatus className={styles[colorOverride]} status="staged" />}
        {status.isOutdated && <ComponentStatus className={styles[colorOverride]} status="updates" />}
        {status.modifyInfo.hasModifiedDependencies && (
          <ComponentStatus className={styles[colorOverride]} status="dependency" />
        )}
        {isInCurrentLane && <LanesIcon />}
      </div>
    </StatusTooltip>
  );
}
