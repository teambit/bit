import React from 'react';
import R from 'ramda';
import { ComponentGrid } from '@bit/bit.explorer.ui.component-grid';
import { ComponentCard } from '@bit/bit.explorer.ui.component-card';
import { ComponentComposition } from '../../../../compositions/ui';
import styles from './workspace-grid.module.scss';

export type WorkspaceComponentGridProps = {
  components: any[];
};

export function WorkspaceComponentGrid({ components }: WorkspaceComponentGridProps) {
  return (
    <div className={styles.container}>
      <ComponentGrid>
        {components.map((component, index) => {
          return (
            <div key={index}>
              <ComponentCard
                id={R.path(['id', 'fullName'], component)}
                size={14093}
                description={component.abstract}
                preview={<ComponentComposition component={component} />}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
