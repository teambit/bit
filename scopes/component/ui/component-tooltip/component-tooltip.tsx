import React from 'react';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentStatus } from '@teambit/workspace';
import styles from './component-tooltip.module.scss';

export type StatusTooltipProps = {
  status?: ComponentStatus;
  issuesCount?: number;
};

// TODO - how do I get the status type without tying this to workspace?
export function StatusTooltip({ status, issuesCount, children }: any) {
  if (!status) return children;

  const { isNew, isStaged, isOutdated, modifyInfo = {} } = status;
  const { hasModifiedDependencies, hasModifiedFiles } = modifyInfo;
  if (!isNew && !isStaged && !hasModifiedDependencies && !hasModifiedFiles && !isOutdated) return null;

  const content = (
    <ul className={styles.list}>
      {issuesCount > 0 && <li>{`${issuesCount} issue${issuesCount > 1 ? `s` : ''} found`}</li>}
      {isNew && !isOutdated && <li>New component</li>}
      {hasModifiedFiles && <li>Modified files</li>}
      {isStaged && <li>Staged component</li>}
      {isOutdated && <li>Updates pending</li>}
      {hasModifiedDependencies && <li>Modified dependencies</li>}
    </ul>
  );

  return (
    <Tooltip className={styles.tooltip} placement="right" content={content}>
      {children}
    </Tooltip>
  );
}
