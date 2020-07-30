import React, { useContext } from 'react';
import R from 'ramda';
import { ComponentGrid } from '@bit/bit.explorer.ui.component-grid';
import { ComponentCard } from '@bit/bit.explorer.ui.component-card';
import { ComponentComposition } from '../../../../compositions/ui';
import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-grid.module.scss';

export function WorkspaceComponentGrid() {
  const workspace = useContext(WorkspaceContext);
  const { components } = workspace;
  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={R.path(['id', 'fullName'], component)}
                size={14093}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
