import { ComponentComposition } from '@teambit/compositions';
import { ComponentCard } from '@teambit/explorer.ui.component-card';
import { ComponentGrid } from '@teambit/explorer.ui.component-grid';
import React, { useContext } from 'react';

import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;

  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={component.id.fullName}
                envIcon={component.environment?.icon}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
