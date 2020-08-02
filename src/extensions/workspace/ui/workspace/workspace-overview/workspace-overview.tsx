import React, { useContext } from 'react';
import { ComponentGrid } from '@bit/bit.explorer.ui.component-grid';
import { ComponentCard } from '@bit/bit.explorer.ui.component-card';
import { ComponentComposition } from '../../../../compositions/ui';
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
                // footer={<CardFooter slot={}></CardFooter>}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
