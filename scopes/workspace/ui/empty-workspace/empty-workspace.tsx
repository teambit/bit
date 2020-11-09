import React from 'react';
import { NoComponents } from '@teambit/ui.no-components';
import styles from './empty-workspace.module.scss';

export function EmptyWorkspace({ name }: { name: string }) {
  return (
    <NoComponents name={name}>
      <div className={styles.text}>Start by adding new components to this workspace.</div>
    </NoComponents>
  );
}
