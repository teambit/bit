import { ComponentID } from '@teambit/component';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import React from 'react';
import classNames from 'classnames';
import { ComponentStatus } from '@teambit/staged-components.component-status';
import { StatusTooltip } from '@teambit/staged-components.component-tooltip';
import { getOverrideColor } from './color-override';
import styles from './component-status-resolver.module.scss';

export type ComponentStatusResolverProps = {
  status?: StatusProps;
  issuesCount?: number;
  id: ComponentID;
};

export function ComponentStatusResolver({ status, id, issuesCount = 0 }: ComponentStatusResolverProps) {
  const isModified = status && (status.modifyInfo.hasModifiedDependencies || status.modifyInfo.hasModifiedFiles);
  if (!status) return null;
  const colorOverride = getOverrideColor(issuesCount, isModified);
  return (
    <div className={styles.statusLine} data-tip="" data-for={id?.name}>
      {issuesCount > 0 && (
        <div className={classNames(styles.errorBlock, styles.error)}>
          <span>{issuesCount}</span>,
        </div>
      )}
      {status.isNew && <ComponentStatus className={styles[colorOverride]} status="new" />}
      {isModified && <ComponentStatus className={styles[colorOverride]} status="modified" />}
      {isModified && status.isStaged && <span className={styles[colorOverride]}>,</span>}
      {status.isStaged && <ComponentStatus className={styles[colorOverride]} status="staged" />}
      <StatusTooltip status={status} name={id?.name} issuesCount={issuesCount} />
    </div>
  );
}
