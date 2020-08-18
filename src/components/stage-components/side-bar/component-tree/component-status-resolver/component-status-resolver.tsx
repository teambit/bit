import React from 'react';
import { ComponentStatus } from '../component-status/component-status';
import { ComponentStatus as StatusProps } from '../../../../../extensions/workspace/workspace-component/component-status';
import { StatusTooltip } from '../component-tooltip';
import styles from './component-status-resolver.module.scss';
import { ComponentID } from '../../../../../extensions/component';

export type ComponentStatusResolverProps = {
  status?: StatusProps;
  id: ComponentID;
};

export function ComponentStatusResolver({ status, id }: ComponentStatusResolverProps) {
  const isModified = status && (status.modifyInfo.hasModifiedDependencies || status.modifyInfo.hasModifiedFiles);
  if (!status) return null;
  const colorOverride = isModified ? 'modified' : '';
  return (
    <div className={styles.statusLine}>
      {status.isNew && <ComponentStatus className={styles[colorOverride]} status="new" />}
      {isModified && <ComponentStatus className={styles[colorOverride]} status="modified" />}
      {isModified && status.isStaged && ','}
      {status.isStaged && <ComponentStatus className={styles[colorOverride]} status="staged" />}
      {/* {status.isError && <ComponentStatus status="error" />} */}
      <StatusTooltip status={status} name={id?.legacyComponentId?.name} />
    </div>
  );
}
