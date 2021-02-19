import React, { useContext } from 'react';
import { ComponentGrid } from '@teambit/ui.gallery.component-grid';
import { EmptyWorkspace } from '@teambit/ui.empty-workspace';
import { WorkspaceComponentCard } from '@teambit/ui.workspace-component-card';
import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;
  if (!components || components.length === 0) return <EmptyWorkspace name={workspace.name} />;
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
