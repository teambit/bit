import React from 'react';
import ReactTooltip from 'react-tooltip';
import { ComponentStatus } from '@teambit/workspace';
import styles from './component-tooltip.module.scss';

export type StatusTooltipProps = {
  status?: ComponentStatus;
  name: string;
  issuesCount?: number;
};

// TODO - how do I get the status type without tying this to workspace?
export function StatusTooltip({ status, name, issuesCount }: any) {
  if (!status) return null;
  const { isNew, isStaged, modifyInfo = {} } = status;
  const { hasModifiedDependencies, hasModifiedFiles } = modifyInfo;
  if (!isNew && !isStaged && !hasModifiedDependencies && !hasModifiedFiles) return null;
  return (
    <ReactTooltip place="right" id={name} effect="solid">
      <ul className={styles.list}>
        {isNew && <li>New component</li>}
        {isStaged && <li>Staged component</li>}
        {hasModifiedFiles && <li>Modified files</li>}
        {hasModifiedDependencies && <li>Modified dependencies</li>}
        {issuesCount > 0 && <li>{`${issuesCount} issue${issuesCount > 1 ? `s` : ''} found`}</li>}
      </ul>
    </ReactTooltip>
  );
}
