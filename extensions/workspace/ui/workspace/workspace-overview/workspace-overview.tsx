import { ComponentGrid } from '@teambit/explorer.ui.component-grid';

import React, { useContext } from 'react';

import { WorkspaceContext } from '../workspace-context';
import { WorkspaceComponentCard } from '../workspace-component-card';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;

  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return <WorkspaceComponentCard key={index} component={component} />;
        })}
      </ComponentGrid>
    </div>
  );
}
