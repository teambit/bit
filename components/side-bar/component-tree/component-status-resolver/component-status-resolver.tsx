import { ComponentID } from '@teambit/component';
import { ComponentStatus as StatusProps } from '@teambit/workspace';
import React from 'react';
import classNames from 'classnames';
import { ComponentStatus } from '../component-status/component-status';
import { StatusTooltip } from '../component-tooltip';
import styles from './component-status-resolver.module.scss';

export type ComponentStatusResolverProps = {
  status?: StatusProps;
  issuesCount?: number;
  id: ComponentID;
};

export function ComponentStatusResolver({ status, id, issuesCount = 0 }: ComponentStatusResolverProps) {
  const isModified = status && (status.modifyInfo.hasModifiedDependencies || status.modifyInfo.hasModifiedFiles);
  if (!status) return null;
  const colorOverride = issuesCount > 0 ? 'error' : isModified ? 'modified' : '';
  return (
    <div className={styles.statusLine}>
      {issuesCount > 0 && <div className={classNames(styles.errorBlock, styles.error)}>{issuesCount},</div>}
      {status.isNew && <ComponentStatus className={styles[colorOverride]} status="new" />}
      {isModified && <ComponentStatus className={styles[colorOverride]} status="modified" />}
      {isModified && status.isStaged && <span className={styles[colorOverride]}>,</span>}
      {status.isStaged && <ComponentStatus className={styles[colorOverride]} status="staged" />}
      <StatusTooltip status={status} name={id?.name} />
    </div>
  );
}
