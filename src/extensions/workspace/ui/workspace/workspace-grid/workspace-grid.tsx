import React from 'react';
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
                id={component.id.name}
                preview={
                  component.compositions.length > 0 && (
                    <ComponentComposition component={component} composition={component.compositions[0]} />
                  )
                }
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}
