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
          const compositions = R.path(['compositions'], component);
          return (
            <div key={index}>
              <ComponentCard
                id={R.path(['legacyComponentId', 'name'], component)}
                size={14093}
                description="Base title component, to be styled by composing components."
              />
              {compositions && compositions.length > 0 && (
                <ComponentComposition component={component} composition={compositions[0]} />
              )}
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
