import React from 'react';
import { NoComponents, NoComponentsProps } from '@teambit/ui.no-components';
import styles from './empty-workspace.module.scss';

export type EmptyWorkspaceProps = { name: string } & NoComponentsProps;

/**
 * A component to show when the workspace is empty
 */
export function EmptyWorkspace({ name }: EmptyWorkspaceProps) {
  return (
    <NoComponents name={name}>
      <div className={styles.text}>Start by adding new components to this workspace.</div>
    </NoComponents>
  );
}
