import { ComponentStatus as StatusProps } from '@teambit/workspace';
import React from 'react';
import classNames from 'classnames';
import { ComponentStatus } from '@teambit/ui.component-status';
import { StatusTooltip } from '@teambit/ui.component-tooltip';
import { getOverrideColor } from './color-override';
import styles from './component-status-resolver.module.scss';

export type ComponentStatusResolverProps = {
  status?: StatusProps;
  issuesCount?: number;
};

export function ComponentStatusResolver({ status, issuesCount = 0 }: ComponentStatusResolverProps) {
  const isModified = status && (status.modifyInfo.hasModifiedDependencies || status.modifyInfo.hasModifiedFiles);
  if (!status) return null;
  const colorOverride = getOverrideColor({ issuesCount, isModified, isNew: status.isNew });

  return (
    <StatusTooltip status={status} issuesCount={issuesCount}>
      <div className={styles.statusLine}>
        {issuesCount > 0 && (
          <div className={classNames(styles.errorBlock, styles.error)}>
            <span>{issuesCount}</span>,
          </div>
        )}
        {status.isNew && <ComponentStatus className={styles[colorOverride]} status="new" />}
        {isModified && !status.isNew && <ComponentStatus className={styles[colorOverride]} status="modified" />}
        {isModified && status.isStaged && <span className={styles[colorOverride]}>,</span>}
        {status.isStaged && <ComponentStatus className={styles[colorOverride]} status="staged" />}
      </div>
    </StatusTooltip>
  );
}
