import React from 'react';
import { Tooltip } from '@teambit/ui.tooltip';
import { ComponentStatus } from '@teambit/workspace';
import styles from './component-tooltip.module.scss';

export type StatusTooltipProps = {
  status?: ComponentStatus;
  issuesCount?: number;
};

// TODO - how do I get the status type without tying this to workspace?
export function StatusTooltip({ status, issuesCount, children }: any) {
  if (!status) return children;

  const { isNew, isStaged, modifyInfo = {} } = status;
  const { hasModifiedDependencies, hasModifiedFiles } = modifyInfo;
  if (!isNew && !isStaged && !hasModifiedDependencies && !hasModifiedFiles) return null;

  const content = (
    <ul className={styles.list}>
      {isNew && <li>New component</li>}
      {isStaged && <li>Staged component</li>}
      {hasModifiedFiles && <li>Modified files</li>}
      {hasModifiedDependencies && <li>Modified dependencies</li>}
      {issuesCount > 0 && <li>{`${issuesCount} issue${issuesCount > 1 ? `s` : ''} found`}</li>}
    </ul>
  );

  return (
    <Tooltip className={styles.tooltip} placement="right" interactive={true} content={content}>
      {children}
    </Tooltip>
  );
}
